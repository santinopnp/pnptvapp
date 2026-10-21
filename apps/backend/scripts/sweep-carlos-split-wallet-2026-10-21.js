'use strict';
/**
 * sweep-carlos-split-wallet-2026-10-21.js
 *
 * Sweeps all USDC from PRIVY_SPLIT_CARLOS (0x870A…E003) on Base
 * to a specified destination address using Privy's server wallet SDK.
 *
 * Usage (from pnptv-bot container):
 *   node apps/backend/scripts/sweep-carlos-split-wallet-2026-10-21.js [--dry-run]
 *
 * Requirements: wallet must have >0 ETH on Base for gas.
 */

const https = require('https');
const { encodeFunctionData, parseUnits, formatUnits } = require('viem');
const { PrivyClient } = require('@privy-io/server-auth');

// ── Config ─────────────────────────────────────────────────────────────────────
const WALLET_ID      = 'kudps5dgrldim01a90e6trpc';
const FROM_ADDRESS   = '0x870A146a6183AAf7e56773AD7C7E5223BB56E003';
const TO_ADDRESS     = '0x2f4e6B23816D439311ab39F335C6AE9C03b9Dc46';
const USDC_CONTRACT  = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const USDC_DECIMALS  = 6;
const CAIP2          = 'eip155:8453';
const ALCHEMY_KEY    = process.env.ALCHEMY_API_KEY;
const PRIVY_APP_ID   = process.env.PRIVY_TREASURY_APP_ID;
const PRIVY_SECRET   = process.env.PRIVY_TREASURY_APP_SECRET;
const DRY_RUN        = process.argv.includes('--dry-run');

const USDC_TRANSFER_ABI = [{
  name: 'transfer',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}];

// ── Helpers ────────────────────────────────────────────────────────────────────

function rpcPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error(`Non-JSON: ${buf}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getUsdcBalance(address) {
  const rpc = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  const padded = address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const res = await rpcPost(rpc, {
    jsonrpc: '2.0', id: 1, method: 'eth_call',
    params: [{ to: USDC_CONTRACT, data: `0x70a08231${padded}` }, 'latest'],
  });
  if (res.error) throw new Error(`RPC error: ${JSON.stringify(res.error)}`);
  return BigInt(res.result);
}

async function getEthBalance(address) {
  const rpc = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  const res = await rpcPost(rpc, {
    jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'],
  });
  if (res.error) throw new Error(`RPC error: ${JSON.stringify(res.error)}`);
  return BigInt(res.result);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!ALCHEMY_KEY || !PRIVY_APP_ID || !PRIVY_SECRET) {
    console.error('Missing env vars: ALCHEMY_API_KEY, PRIVY_TREASURY_APP_ID, PRIVY_TREASURY_APP_SECRET');
    process.exit(1);
  }

  console.log('=== CARLOS SPLIT WALLET SWEEP ===');
  console.log(`From : ${FROM_ADDRESS}`);
  console.log(`To   : ${TO_ADDRESS}`);
  if (DRY_RUN) console.log('*** DRY RUN — no transaction will be sent ***\n');

  // 1. Check balances
  const [usdcRaw, ethRaw] = await Promise.all([
    getUsdcBalance(FROM_ADDRESS),
    getEthBalance(FROM_ADDRESS),
  ]);

  const usdcHuman = formatUnits(usdcRaw, USDC_DECIMALS);
  const ethHuman  = formatUnits(ethRaw, 18);
  console.log(`USDC balance : ${usdcHuman} USDC`);
  console.log(`ETH balance  : ${ethHuman} ETH (gas)`);

  if (usdcRaw === 0n) {
    console.log('\nNothing to sweep — USDC balance is 0.');
    return;
  }

  if (ethRaw < parseUnits('0.00005', 18)) {
    console.error('\n⚠ Insufficient ETH for gas.');
    console.error('Send at least 0.001 ETH on BASE network to:');
    console.error(`  ${FROM_ADDRESS}`);
    console.error('Then re-run this script.');
    process.exit(1);
  }

  // 2. Encode USDC transfer calldata
  const calldata = encodeFunctionData({
    abi: USDC_TRANSFER_ABI,
    functionName: 'transfer',
    args: [TO_ADDRESS, usdcRaw],
  });

  console.log(`\nSweeping ${usdcHuman} USDC → ${TO_ADDRESS}`);

  if (DRY_RUN) {
    console.log('Dry run complete — would call Privy SDK sendTransaction now.');
    return;
  }

  // 3. Send via Privy SDK (uses correct /api/v1/wallets/{id}/rpc endpoint)
  const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_SECRET);
  const result = await privy.walletApi.ethereum.sendTransaction({
    walletId: WALLET_ID,
    caip2: CAIP2,
    transaction: {
      from: FROM_ADDRESS,
      to: USDC_CONTRACT,
      data: calldata,
    },
  });

  console.log('\n✓ Transaction submitted!');
  console.log(`Tx hash : ${result.hash}`);
  console.log(`BaseScan: https://basescan.org/tx/${result.hash}`);
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
