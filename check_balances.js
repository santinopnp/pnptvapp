const { createPublicClient, http, formatUnits } = require('viem');
const { mainnet, base } = require('viem/chains');
const { execSync } = require('child_process');

const ALCHEMY_KEY = 'alch_7-toqFnW2TybLDwEBtP6l';
const USDC_BASE    = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ETH     = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ERC20_ABI    = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }];

const ethClient  = createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`) });
const baseClient = createPublicClient({ chain: base,    transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`) });

async function checkWallet(address) {
  const [ethUsdc, baseUsdc, baseEth, ethEth] = await Promise.all([
    ethClient.readContract({ address: USDC_ETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
    baseClient.readContract({ address: USDC_BASE, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
    baseClient.getBalance({ address }).catch(() => 0n),
    ethClient.getBalance({ address }).catch(() => 0n),
  ]);
  return {
    address,
    eth_usdc: parseFloat(formatUnits(ethUsdc, 6)),
    base_usdc: parseFloat(formatUnits(baseUsdc, 6)),
    base_eth: parseFloat(formatUnits(baseEth, 18)),
    eth_eth: parseFloat(formatUnits(ethEth, 18)),
  };
}

// Get all addresses from DB
const addresses = execSync(`docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -t -A -F',' -c "SELECT wallet_address FROM users WHERE wallet_address IS NOT NULL AND privy_id IS NOT NULL AND (is_deleted = false OR is_deleted IS NULL);"`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);

console.log(`Checking ${addresses.length} wallets...`);

async function main() {
  const results = [];
  const BATCH = 20;
  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(checkWallet));
    results.push(...batchResults);
    process.stderr.write(`${Math.min(i + BATCH, addresses.length)}/${addresses.length}\n`);
  }
  const withFunds = results.filter(r => r.eth_usdc > 0 || r.base_usdc > 0 || r.base_eth > 0.001 || r.eth_eth > 0.001);
  console.log('\n=== USERS WITH FUNDS ===');
  withFunds.forEach(r => console.log(JSON.stringify(r)));
  console.log(`\nTotal: ${addresses.length} wallets checked, ${withFunds.length} have funds`);
}
main().catch(console.error);
