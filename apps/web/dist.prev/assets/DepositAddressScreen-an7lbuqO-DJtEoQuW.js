import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{w as t}from"./livekit-DxfWoNFy.js";import{i as n}from"./vendor-C-olS35e.js";import{J as r,q as i,xn as a}from"./context-MM1cZbHj-D-btNsEz.js";import{i as o,s}from"./styled-components.browser.esm-CHmEdfXT.js";import{p as c}from"./storage-ClxaIe6D-Cc15ifxP.js";import{t as l}from"./modal-context-IJNBQScK-BcXJs4M4.js";import{i as u,r as d,s as f,t as ee}from"./floating-ui.react-dom-DIh1TWKW.js";import{a as te,c as ne,d as re,f as ie,i as p,o as m,r as h,s as ae,t as oe,u as se}from"./floating-ui.react-dI7zm41A.js";import{t as ce}from"./Loader-ekqMW2w--BC3DSiTe.js";import{a as g,i as _,t as v}from"./use-deposit-address-BCu_3EsR-Bq3ew7WF.js";import{t as y}from"./createLucideIcon-J4i2xPyB.js";import{t as b}from"./check-BvyUOM6D.js";import{t as le}from"./chevron-down-9MN5LLyp.js";import{t as ue}from"./hourglass-DBr3cqeq.js";import{_ as x,a as S,c as C,d as w,f as T,g as E,h as D,i as de,l as O,m as k,n as A,o as j,p as M,r as N,s as P,t as F,u as fe,v as I}from"./styles-TJpjszba-ZHQDYKny.js";import{t as L}from"./triangle-alert-BuU-DXsf.js";import{a as R}from"./ModalFooter-DfVgQI26-Ccu9UnVQ.js";import{t as z}from"./ScreenLayout-BO5nCe4K-CrgqWtiC.js";import{r as B}from"./styles-DVyDvTdj-Cm6y3anw.js";import{n as V}from"./CopyableText-CQapvaMr-Iw9h3iex.js";import{t as pe}from"./browser-DqeetQDI.js";import{t as me}from"./QrCode-Cl_AC0vU-CoTYC5e0.js";var he=y(`chevron-up`,[[`path`,{d:`m18 15-6-6-6 6`,key:`153udz`}]]),ge=y(`info`,[[`circle`,{cx:`12`,cy:`12`,r:`10`,key:`1mglay`}],[`path`,{d:`M12 16v-4`,key:`1dtifu`}],[`path`,{d:`M12 8h.01`,key:`e9boi3`}]]),_e=y(`undo-2`,[[`path`,{d:`M9 14 4 9l5-5`,key:`102s5s`}],[`path`,{d:`M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11`,key:`f3b9sd`}]]),H=n(),U=e(t(),1);pe();var ve=class extends U.Component{static getDerivedStateFromError(){return{hasError:!0}}componentDidCatch(e,t){this.props.onError(e)}componentDidUpdate(e){e.resetKey!==this.props.resetKey&&this.state.hasError&&this.setState({hasError:!1})}render(){return this.state.hasError?null:this.props.children}constructor(...e){super(...e),this.state={hasError:!1}}};function ye(e,t,n){let r=Number(e);return!Number.isFinite(r)||r===0?`1 ${t} ≈ ${e} ${n}`:r>=.01?`1 ${t} ≈ ${W(r)} ${n}`:`${W(1/r)} ${t} ≈ 1 ${n}`}function W(e){return e>=1e3?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:0}).format(Math.round(e)):e>=100?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:1}).format(e):e>=1?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:2}).format(e):new Intl.NumberFormat(`en-US`,{maximumFractionDigits:4}).format(e)}function G(e,t){let n=Number(e);if(!Number.isFinite(n)||n===0)return e;let r=t==null?n:n/10**t;return r>=1e3?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:2}).format(r):r>=1?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:4}).format(r):r>=1e-4?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:6}).format(r):new Intl.NumberFormat(`en-US`,{maximumSignificantDigits:4}).format(r)}function K({address:e,caip2:t,config:n}){for(let r of n.currencies){let n=r.chains.find((n=>n.caip2===t&&n.address.toLowerCase()===e.toLowerCase()));if(n)return{symbol:r.symbol.toUpperCase(),decimals:n.decimals}}return{symbol:e,decimals:void 0}}function q(e,t){return t[e]?.displayName??e}function J(e,t){return e.chains.filter((e=>!0===e.can_be_relay_deposit_source)).map((e=>{let n=t.chains[e.caip2];return n?{caip2:e.caip2,displayName:n.displayName,iconUrl:n.iconUrl,vmType:n.vmType,currencyAddress:e.address,currencyDecimals:e.decimals}:null})).filter((e=>e!==null))}function Y(e,t){if(!e.chains[t.destinationChain])return`Unsupported destination chain: "${t.destinationChain}". Check that the chain is in CAIP-2 format (e.g. "eip155:8453") and is supported for deposit addresses.`;let n=t.destinationCurrency.toLowerCase();return e.currencies.some((e=>e.chains.some((e=>e.caip2===t.destinationChain&&e.address.toLowerCase()===n))))?null:`Unsupported destination currency "${t.destinationCurrency}" on chain "${t.destinationChain}". Check that this token address is supported on the specified chain.`}var be=new Set([`ROUTE_UNAVAILABLE`,`UNEXPECTED_STATE`,`TIMEOUT_WAITING_FOR_NEXT_ORDER`,`TIMEOUT_ORDER_COMPLETION`,`DEPOSIT_FAILED`,`DEPOSIT_REFUNDED`,`USER_EXITED`,`AMOUNT_TOO_LOW`,`INSUFFICIENT_LIQUIDITY`,`UNSUPPORTED_CHAIN`,`UNSUPPORTED_CURRENCY`,`UNSUPPORTED_ROUTE`,`NO_SWAP_ROUTES_FOUND`,`NO_INTERNAL_SWAP_ROUTES_FOUND`,`NO_QUOTES`,`SANCTIONED_WALLET_ADDRESS`,`REFUND_WALLET_CREATION_FAILED`,`DEPOSIT_ADDRESSES_NOT_ENABLED`,`NOT_AUTHENTICATED`]);function xe(e){return be.has(e)}function X(e){return xe(e)?e:`UNKNOWN_ERROR`}function Z(){let{params:e,setModalState:t}=g(),{privy:n}=s(),o=function(){let{privy:e,refreshSessionAndUser:t}=s();return(0,U.useCallback)(((n,i)=>i?Promise.resolve({ok:!0,address:i}):r.resolveRefundAddress({privy:e,caip2:n,onWalletCreated:t})),[e,t])}(),[c,l]=(0,U.useState)(!1);return{fetchQuote:(0,U.useCallback)((async(r,s,c)=>{if(e){l(!0);try{let i=await o(r.caip2,e.refundAddress);if(!i.ok)return void t({step:`error`,code:X(i.error)});let l=await n.fetchPrivyRoute(a,{body:{source_chain:r.caip2,source_currency:r.currencyAddress,destination_chain:e.destinationChain,destination_currency:e.destinationCurrency,destination_address:e.destinationAddress,refund_address:i.address,...e.slippageBps==null?{}:{slippage_bps:e.slippageBps}}});t({step:`address`,selectedCurrency:s,selectedChain:r,availableChains:c,quote:l})}catch(e){let n=e instanceof Error?e:Error(String(e)),r=`status`in n&&typeof n.status==`number`?n.status:void 0;t({step:`error`,code:n instanceof i&&n.code===`feature_not_enabled`?`DEPOSIT_ADDRESSES_NOT_ENABLED`:r&&r>=500?`UNKNOWN_ERROR`:X(n.message),message:n.message})}finally{l(!1)}}}),[e,n,o,t]),isFetching:c}}function Q(e,t){switch(e.status){case`completed`:return t({step:`complete`,order:e});case`refunded`:return t({step:`refunded`,order:e});case`failed`:return t({step:`failed`,order:e});case`executing`:return t({step:`processing`,order:e});default:return}}var Se=({sourceAmount:e,sourceSymbol:t,sourceChainName:n,sourceDecimals:r,destinationAmount:i,destSymbol:a,destChainName:o,destDecimals:s,onClose:c})=>(0,H.jsx)(C,{icon:b,iconVariant:`success`,title:`Transfer complete`,subtitle:i?`Received ${G(e,r)} ${t} on ${n} and converted it to ${G(i,s)} ${a} on ${o}. Funds are available to use.`:`Your ${t} has been received and is now available in your wallet.`,showClose:!0,onClose:c,primaryCta:{label:`Done`,onClick:c},watermark:!1});function Ce(){let{state:e,configData:t,close:n}=v(`complete`),{order:r}=e,{sourceSymbol:i,sourceChainName:a,sourceDecimals:o,destSymbol:s,destChainName:c,destDecimals:l}=(0,U.useMemo)((()=>{let e=K({address:r.source_currency,caip2:r.source_chain,config:t}),n=K({address:r.destination_currency,caip2:r.destination_chain,config:t});return{sourceSymbol:e.symbol,sourceChainName:q(r.source_chain,t.chains),sourceDecimals:e.decimals,destSymbol:n.symbol,destChainName:q(r.destination_chain,t.chains),destDecimals:n.decimals}}),[r,t]);return(0,H.jsx)(Se,{sourceAmount:r.source_amount,sourceSymbol:i,sourceChainName:a,sourceDecimals:o,destinationAmount:r.destination_amount,destSymbol:s,destChainName:c,destDecimals:l,onClose:n})}function we(){let{modalState:e,setModalState:t,config:n,retryConfig:r,close:i,createDepositAddressEvent:a}=g();if(e.step!==`error`)throw Error(`UNEXPECTED_STATE`);let{code:o}=e,{title:s,subtitle:c,detail:l,iconVariant:u}=(e=>{switch(e){case`AMOUNT_TOO_LOW`:return{title:`Amount too low`,subtitle:`The deposit amount is below the minimum for this route.`,detail:`Try a larger amount or a different token.`,iconVariant:`warning`};case`INSUFFICIENT_LIQUIDITY`:return{title:`Insufficient liquidity`,subtitle:`There isn't enough liquidity for this route right now.`,detail:`Try a smaller amount or a different network.`,iconVariant:`warning`};case`UNSUPPORTED_CHAIN`:return{title:`Unsupported chain`,subtitle:`Deposits from this chain type aren't supported yet. Try a different network.`,iconVariant:`warning`};case`UNSUPPORTED_CURRENCY`:case`UNSUPPORTED_ROUTE`:case`ROUTE_UNAVAILABLE`:case`NO_SWAP_ROUTES_FOUND`:case`NO_INTERNAL_SWAP_ROUTES_FOUND`:case`NO_QUOTES`:return{title:`Route not available`,subtitle:`This deposit route isn't supported right now. Try a different token or network.`,iconVariant:`warning`};case`SANCTIONED_WALLET_ADDRESS`:return{title:`Address restricted`,subtitle:`This address cannot be used for deposits due to compliance restrictions.`,iconVariant:`warning`};case`REFUND_WALLET_CREATION_FAILED`:return{title:`Unable to set up refund address`,subtitle:`We couldn't create a wallet to receive refunds on this chain. Please try again or select a different network.`,iconVariant:`warning`};case`DEPOSIT_ADDRESSES_NOT_ENABLED`:return{title:`Not enabled`,subtitle:`Deposit addresses are not enabled for this app.`,iconVariant:`warning`};case`NOT_AUTHENTICATED`:return{title:`Not signed in`,subtitle:`Please sign in to continue with your deposit.`,iconVariant:`warning`};case`TIMEOUT_WAITING_FOR_NEXT_ORDER`:case`TIMEOUT_ORDER_COMPLETION`:return{title:`Taking longer than expected`,subtitle:`Your funds are safe. The deposit is still being processed — check back later.`,iconVariant:`subtle`};default:return{title:`Something went wrong`,subtitle:`We couldn't complete your request. Please try again.`,iconVariant:`subtle`}}})(o),[d,f]=(0,U.useState)(!1);return(0,H.jsx)(C,{icon:L,iconVariant:u,title:s,subtitle:l?`${c} ${l}`:c,showClose:!0,onClose:i,primaryCta:{label:`Try again`,onClick:async()=>{if(a({eventName:`sdk_deposit_address_action`,payload:{action:`retry`,step:`error`,errorCode:o}}),n.status!==`ready`){f(!0);try{await r(),t({step:`token`})}catch{f(!1)}}else t({step:`token`})},loading:d},watermark:!0})}function Te(){let{state:e,close:t,createDepositAddressEvent:n}=v(`failed`),{order:r}=e;return(0,H.jsx)(z,{icon:L,iconVariant:`error`,title:`Transfer failed`,subtitle:`Something went wrong processing your transfer.`,showClose:!0,onClose:t,primaryCta:{label:`Done`,onClick:t},secondaryCta:{label:`Learn about manual recovery`,onClick:()=>{n({eventName:`sdk_deposit_address_action`,payload:{action:`link_opened`,step:`failed`,target:`recovery_docs`}}),window.open(`https://docs.privy.io`,`_blank`,`noopener,noreferrer`)}},watermark:!0,children:(0,H.jsxs)(Ee,{href:r.tracking_url,target:`_blank`,rel:`noopener noreferrer`,onClick:()=>{n({eventName:`sdk_deposit_address_action`,payload:{action:`link_opened`,step:`failed`,target:`relay_reference`}})},children:[`Reference: `,r.provider_request_id]})})}var Ee=o.a`
  text-align: center;
  font-size: 0.75rem;
  opacity: 0.7;
  text-decoration: underline;
  cursor: pointer;
  color: var(--privy-color-foreground-3);
`;function De(){let{close:e,setModalState:t,config:n,params:r,onBack:i,createDepositAddressEvent:a}=g(),[o,s]=(0,U.useState)(!1);return(0,U.useEffect)((()=>{if(o&&r){if(n.status===`ready`){let e=Y(n.data,r);t(e?{step:`error`,code:`ROUTE_UNAVAILABLE`,message:e}:{step:`token`})}n.status===`error`&&t({step:`error`,code:`ROUTE_UNAVAILABLE`})}}),[o,n,r,t]),(0,H.jsx)(C,{icon:I,iconVariant:`subtle`,title:`Add funds`,subtitle:`Top up your account by sending crypto from any wallet. Conversion and routing handled by Relay.`,showClose:!0,onClose:e,showBack:!!i,onBack:i?()=>{a({eventName:`sdk_deposit_address_action`,payload:{action:`back`,step:`intro`}}),i()}:void 0,primaryCta:{label:`Continue`,onClick:()=>{if(a({eventName:`sdk_deposit_address_action`,payload:{action:`continue`,step:`intro`}}),n.status===`ready`&&r){let e=Y(n.data,r);t(e?{step:`error`,code:`ROUTE_UNAVAILABLE`,message:e}:{step:`token`})}else n.status===`error`?t({step:`error`,code:`ROUTE_UNAVAILABLE`}):s(!0)},loading:o&&n.status===`loading`,loadingText:null},watermark:!0})}function Oe(){let{state:e,setModalState:t,close:n,createDepositAddressEvent:r}=v(`network`),[i,a]=(0,U.useState)(-1),{availableChains:o}=e,{confirm:s,isFetching:c}=function(){let e=_(),{params:t}=g(),{fetchQuote:n,isFetching:r}=Z();return{confirm:(0,U.useCallback)((async r=>{if(!r||!t)return;let i=e?.modalState;i&&i.step===`network`&&await n(r,i.selectedCurrency,i.availableChains)}),[t,e,n]),isFetching:r}}();return(0,H.jsx)(z,{title:`Select network`,eyebrow:(0,H.jsxs)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`0.375rem`},children:[(0,H.jsx)(`img`,{src:e.selectedCurrency.logoURI,alt:``,style:{width:`1rem`,height:`1rem`,borderRadius:`50%`}}),`Send `,e.selectedCurrency.symbol]}),showBack:!0,onBack:()=>{r({eventName:`sdk_deposit_address_action`,payload:{action:`back`,step:`network`}}),t({step:`token`})},showClose:!0,onClose:n,watermark:!0,children:(0,H.jsx)(B,{style:{marginTop:`1rem`,height:`22rem`},$colorScheme:`light`,children:o.map(((e,t)=>(0,H.jsxs)(O,{$selected:i===t,disabled:c,onClick:()=>{r({eventName:`sdk_deposit_address_action`,payload:{action:`network_selected`,step:`network`,network:e.caip2}}),a(t),s(e)},children:[(0,H.jsx)(k,{src:e.iconUrl,alt:e.displayName}),(0,H.jsx)(M,{children:e.displayName}),c&&t===i&&(0,H.jsx)(x,{})]},e.caip2)))})})}var ke=({trackingUrl:e,onViewBlockExplorer:t,onClose:n})=>(0,H.jsx)(z,{icon:ue,iconVariant:`subtle`,title:`Transfer in progress`,subtitle:`Your deposit was received and the transfer is now processing.`,showClose:!0,onClose:n,secondaryCta:{label:`View on block explorer ↗`,onClick:()=>{t(),window.open(e,`_blank`,`noopener,noreferrer`)}},watermark:!1,children:(0,H.jsxs)(fe,{children:[(0,H.jsxs)(j,{children:[(0,H.jsx)(T,{$status:`done`,children:(0,H.jsx)(b,{size:14,color:`var(--privy-color-icon-success)`,strokeWidth:2})}),(0,H.jsx)(S,{children:`Deposit received`})]}),(0,H.jsx)(E,{}),(0,H.jsxs)(j,{children:[(0,H.jsx)(T,{$status:`active`,children:(0,H.jsx)(Ae,{})}),(0,H.jsx)(S,{children:`Bridging`})]}),(0,H.jsx)(E,{}),(0,H.jsxs)(j,{children:[(0,H.jsx)(T,{$status:`pending`}),(0,H.jsx)(S,{children:`Funds arrived`})]})]})}),Ae=o.span`
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--privy-color-foreground-3);
  border-bottom-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;function je(){let{state:e,close:t,createDepositAddressEvent:n}=v(`processing`);return function({orderId:e,enabled:t}){let{privy:n}=s(),{setModalState:i}=g();(0,U.useEffect)((()=>{let t=new AbortController;return r.waitForCompletion({privy:n,orderId:e,signal:t.signal}).then((e=>{t.signal.aborted||(e.status===`success`?Q(e.order,i):e.status===`timeout`&&i({step:`error`,code:`TIMEOUT_ORDER_COMPLETION`}))})),()=>{t.abort()}}),[t,e,n,i])}({orderId:e.order.id,enabled:!0}),(0,H.jsx)(ke,{trackingUrl:e.order.tracking_url,onViewBlockExplorer:()=>{n({eventName:`sdk_deposit_address_action`,payload:{action:`link_opened`,step:`processing`,target:`block_explorer`}})},onClose:t})}function Me(){let{state:e,close:t,createDepositAddressEvent:n}=v(`refunded`),{order:r}=e;return(0,H.jsx)(C,{icon:_e,iconVariant:`subtle`,title:`Transfer refunded`,subtitle:`Your transfer was received, but the swap couldn't be completed. A refund has been started automatically.`,showClose:!0,onClose:t,primaryCta:{label:`Done`,onClick:t},secondaryCta:{label:`View transaction details`,onClick:()=>{n({eventName:`sdk_deposit_address_action`,payload:{action:`link_opened`,step:`refunded`,target:`transaction_details`}}),window.open(r.tracking_url,`_blank`,`noopener,noreferrer`)}},watermark:!0})}function Ne(){let{close:e,setModalState:t,config:n,createDepositAddressEvent:r}=g(),{confirm:i,currencies:a,isFetching:o}=function(){let{config:e,setModalState:t}=g(),{fetchQuote:n,isFetching:r}=Z(),i=e.status===`ready`?e.data.currencies.filter((t=>J(t,e.data).length>0)):[];return{confirm:(0,U.useCallback)((async r=>{if(e.status!==`ready`||!r)return;let i=J(r,e.data);if(i.length!==1)t({step:`network`,selectedCurrency:r,availableChains:i});else{let e=i[0];await n(e,r,i)}}),[e,n,t]),currencies:i,isFetching:r}}(),[s,c]=(0,U.useState)(-1);return(0,H.jsx)(z,{title:`Select token`,subtitle:`Choose the asset you'll send.`,showBack:!0,onBack:()=>{r({eventName:`sdk_deposit_address_action`,payload:{action:`back`,step:`token`}}),t({step:`intro`})},showClose:!0,onClose:e,watermark:!0,children:n.status===`error`?(0,H.jsx)(N,{children:(0,H.jsx)(w,{children:`Failed to load tokens`})}):n.status===`loading`?(0,H.jsx)(N,{children:(0,H.jsx)(ce,{})}):(0,H.jsx)(B,{style:{marginTop:`1rem`,height:`22rem`},$colorScheme:`light`,children:a.map(((e,t)=>(0,H.jsxs)(O,{$selected:s===t,disabled:o,onClick:()=>{r({eventName:`sdk_deposit_address_action`,payload:{action:`token_selected`,step:`token`,token:e.symbol}}),c(t),i(e)},children:[(0,H.jsx)(F,{src:e.logoURI,alt:e.symbol}),(0,H.jsx)(M,{children:e.name}),o&&t===s?(0,H.jsx)(x,{}):(0,H.jsx)(de,{children:e.symbol})]},e.symbol)))})})}function Pe({address:e,onClick:t}){let[n,r]=(0,U.useState)(!1);return(0,H.jsx)(H.Fragment,{children:n?(0,H.jsx)(Fe,{onClick:()=>r(!1),style:{marginTop:`1.5rem`},children:(0,H.jsx)(me,{url:e,size:312,hideLogo:!0})}):(0,H.jsxs)(Ie,{title:`Click to copy address`,onClick:t,style:{marginTop:`1.5rem`},children:[(0,H.jsxs)(Le,{children:[(0,H.jsx)(Re,{children:`Deposit address`}),(0,H.jsx)(ze,{children:e})]}),(0,H.jsx)(Be,{children:(0,H.jsx)(Ve,{type:`button`,onClick:e=>{e.stopPropagation(),r(!0)},children:(0,H.jsx)(I,{size:16,color:`var(--privy-color-icon-muted)`})})})]})})}var Fe=o.div`
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
`,Ie=o.div`
  display: flex;
  border-radius: var(--privy-border-radius-md);
  background: var(--privy-color-background-clicked, #f1f2f9);
  padding: 1rem;
  cursor: pointer;
  gap: 0.5rem;
`,Le=o.div`
  flex: 1;
  min-width: 0;
  text-align: left;
`,Re=o.div`
  font-size: 0.75rem;
  color: var(--privy-color-icon-muted);
  line-height: 1rem;
  margin-bottom: 0.25rem;
`,ze=o.div`
  word-break: break-all;
  font-size: 0.875rem;
  font-family: ui-monospace, monospace;
  font-weight: 500;
  line-height: 1.375rem;
  color: var(--privy-color-foreground);
`,Be=o.div`
  width: 1.5rem;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding-top: 0.25rem;
`,Ve=o.button`
  && {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    outline: none;
    box-shadow: none;
    border-radius: var(--privy-border-radius-xs);

    &:hover {
      background: var(--privy-color-background);
    }

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`;function He({quote:e,selectedCurrency:t,selectedChain:n,destinationSymbol:r}){let[i,a]=(0,U.useState)(!1),o=t.symbol.toUpperCase(),s=n.displayName,l=(0,U.useRef)(null);return(0,H.jsxs)(Ue,{children:[(0,H.jsxs)(We,{onClick:(0,U.useCallback)((()=>{let e=document.getElementById(`privy-modal-content`);e&&(l.current&&clearTimeout(l.current),e.style.transition=`none`,l.current=setTimeout((()=>{e.style.transition=``,l.current=null}),160)),a((e=>!e))}),[]),children:[(0,H.jsxs)(Ge,{children:[t.logoURI&&(0,H.jsx)(F,{src:t.logoURI,alt:o,style:{width:`2rem`,height:`2rem`}}),n.iconUrl&&(0,H.jsx)(Ke,{src:n.iconUrl,alt:s})]}),(0,H.jsxs)(qe,{children:[(0,H.jsx)(Je,{children:`You send`}),(0,H.jsxs)($,{children:[o,` on `,s]})]}),(0,H.jsx)(Ye,{children:(0,H.jsx)(i?he:le,{size:16})})]}),(0,H.jsx)($e,{$expanded:i,children:(0,H.jsx)(et,{children:(0,H.jsxs)(Xe,{children:[e.indicative_rate&&(0,H.jsxs)(D,{children:[(0,H.jsx)(P,{children:`Conversion rate`}),(0,H.jsxs)(A,{style:{display:`flex`,alignItems:`center`,gap:`0.25rem`},children:[ye(e.indicative_rate,o,r.toUpperCase()),(0,H.jsx)(tt,{content:`Estimated rate based on current market conditions. Final execution price may vary depending on transfer size and routing.`})]})]}),(0,H.jsxs)(D,{children:[(0,H.jsx)(P,{children:`Max slippage`}),(0,H.jsxs)(A,{children:[(e.slippage_bps/100).toFixed(1),`%`]})]}),(0,H.jsxs)(D,{children:[(0,H.jsx)(P,{children:`Refund address`}),(0,H.jsx)(A,{children:(0,H.jsx)(V,{value:e.refund_address,iconOnly:!0,iconSize:11,children:c(e.refund_address,4,4)})})]})]})})}),(0,H.jsxs)(Ze,{children:[(0,H.jsx)(L,{size:16,color:`var(--privy-color-icon-muted)`,style:{flexShrink:0}}),(0,H.jsxs)(Qe,{children:[`Only send `,(0,H.jsx)(`strong`,{children:o}),` on `,(0,H.jsx)(`strong`,{children:s}),`. Other assets may be lost.`]})]})]})}var Ue=o.div`
  border-radius: var(--privy-border-radius-md);
  border: 1px solid var(--privy-color-foreground-4);
  overflow: hidden;
`,We=o.button`
  && {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--privy-color-foreground);
    outline: none;
    box-shadow: none;

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`,Ge=o.span`
  position: relative;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
`,Ke=o(k)`
  && {
    position: absolute;
    top: -0.125rem;
    right: -0.25rem;
    width: 0.75rem;
    height: 0.75rem;
    box-sizing: content-box;
    border: 1.5px solid var(--privy-color-background);
    background-color: var(--privy-color-background);
  }
`,qe=o.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,Je=o.span`
  font-size: 0.75rem;
  color: var(--privy-color-foreground-3);
  line-height: 1rem;
`,$=o.span`
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
`,Ye=o.span`
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-clicked, #f1f2f9);
  color: var(--privy-color-foreground-3);
`,Xe=o.div`
  display: flex;
  flex-direction: column;
  padding: 0 1rem 0.75rem;

  & > * {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--privy-color-foreground-4);
  }

  & > *:last-child {
    border-bottom: none;
  }
`,Ze=o.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0.75rem 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--privy-border-radius-sm);
  background: var(--privy-color-background-2);
`,Qe=o.span`
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: var(--privy-color-icon-muted);
  text-align: left;
`,$e=o.div`
  display: grid;
  grid-template-rows: ${({$expanded:e})=>e?`1fr`:`0fr`};
  transition: grid-template-rows 150ms ease-out;
`,et=o.div`
  overflow: hidden;
`;function tt({content:e}){let[t,n]=(0,U.useState)(!1),{refs:r,floatingStyles:i,context:a}=m({open:t,onOpenChange:n,placement:`top`,whileElementsMounted:f,middleware:[d(6),ee(),u({padding:8})]}),{getReferenceProps:o,getFloatingProps:s}=se([ne(a,{move:!1,handleClose:h()}),ae(a),p(a),te(a),re(a,{role:`tooltip`})]),{isMounted:c,styles:l}=ie(a,{duration:150});return(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)(`button`,{ref:r.setReference,type:`button`,"aria-label":`More information about conversion rate`,style:{display:`inline-flex`,alignItems:`center`,justifyContent:`center`,padding:0,border:`none`,background:`none`,color:`var(--privy-color-icon-muted)`,cursor:`pointer`},...o(),children:(0,H.jsx)(ge,{size:14})}),c&&(0,H.jsx)(oe,{root:document.getElementById(`privy-modal-content`)??void 0,children:(0,H.jsx)(nt,{ref:r.setFloating,style:{...i,...l},...s(),children:e})})]})}var nt=o.div`
  max-width: 13rem;
  padding: 0.5rem 0.625rem;
  border-radius: var(--privy-border-radius-sm, 0.375rem);
  background: var(--privy-color-foreground);
  color: var(--privy-color-background);
  font-size: 0.6875rem;
  line-height: 1rem;
  font-weight: 400;
  text-align: left;
  z-index: 10;
`,rt=({quote:e,selectedCurrency:t,selectedChain:n,destinationSymbol:r,onBack:i,onClose:a})=>{let[o,s]=(0,U.useState)(!1),c=t?.symbol?.toUpperCase()??`funds`,l=n?.displayName??``,u=async()=>{o||(await navigator.clipboard.writeText(e.deposit_address),s(!0),setTimeout((()=>s(!1)),2e3))};return(0,H.jsxs)(z,{title:`Send ${c}${l?` on ${l}`:``}`,subtitle:`Send funds to the address below. Conversion and routing handled by Relay.`,showBack:!0,onBack:i,showClose:!0,onClose:a,watermark:!1,children:[(0,H.jsx)(He,{quote:e,selectedCurrency:t,selectedChain:n,destinationSymbol:r}),(0,H.jsx)(Pe,{address:e.deposit_address,onClick:u}),(0,H.jsx)(R,{style:{marginTop:`1rem`,marginBottom:`0.5rem`,...o?{backgroundColor:`var(--privy-color-icon-success)`,borderColor:`var(--privy-color-icon-success)`}:{}},onClick:u,children:o?(0,H.jsxs)(H.Fragment,{children:[`Copied `,(0,H.jsx)(b,{size:16,style:{marginLeft:`0.25rem`}})]}):`Copy address`}),(0,H.jsx)(it,{children:`Routing and bridging are handled by Relay. Privy does not control execution timing, liquidity, or transaction outcomes.`})]})},it=o.p`
  && {
    margin: 0.5rem 0 0;
    font-size: 0.6875rem;
    line-height: 1.125rem;
    color: var(--privy-color-icon-muted);
    text-align: center;
  }
`;function at(){let{state:e,configData:t,setModalState:n,close:i,params:a,createDepositAddressEvent:o}=v(`address`),{quote:c,selectedCurrency:l,selectedChain:u,availableChains:d}=e;return function({depositAddressId:e,enabled:t,quoteCreatedAt:n}){let{privy:i}=s(),{setModalState:a}=g();(0,U.useEffect)((()=>{if(!e)return;let t=new AbortController;return r.waitForDeposit({privy:i,depositAddressId:e,quoteCreatedAt:n,signal:t.signal}).then((e=>{t.signal.aborted||(e.status===`success`?Q(e.order,a):e.status===`timeout`&&a({step:`error`,code:`TIMEOUT_WAITING_FOR_NEXT_ORDER`}))})),()=>{t.abort()}}),[t,e,i,n,a])}({depositAddressId:c.id,enabled:!0,quoteCreatedAt:c.created_at}),(0,H.jsx)(rt,{quote:c,selectedCurrency:l,selectedChain:u,destinationSymbol:(0,U.useMemo)((()=>K({address:a.destinationCurrency,caip2:a.destinationChain,config:t}).symbol),[a,t]),onBack:()=>{o({eventName:`sdk_deposit_address_action`,payload:{action:`back`,step:`address`}}),n({step:`network`,selectedCurrency:l,availableChains:d})},onClose:i})}function ot(){let{modalState:e,setModalState:t}=g();return(0,H.jsx)(ve,{onError:e=>t({step:`error`,code:`UNEXPECTED_STATE`,message:e.message}),resetKey:e.step,children:(0,H.jsx)(st,{})})}function st(){let{modalState:e}=g();switch(e.step){case`intro`:return(0,H.jsx)(De,{});case`token`:return(0,H.jsx)(Ne,{});case`network`:return(0,H.jsx)(Oe,{});case`address`:return(0,H.jsx)(at,{});case`processing`:return(0,H.jsx)(je,{});case`complete`:return(0,H.jsx)(Ce,{});case`refunded`:return(0,H.jsx)(Me,{});case`failed`:return(0,H.jsx)(Te,{});case`error`:return(0,H.jsx)(we,{});default:return null}}var ct={component:()=>{let{onUserCloseViaDialogOrKeybindRef:e}=l(),t=_(),{close:n,config:r}=g();return(0,U.useEffect)((()=>{e.current=n}),[e,n]),(0,U.useEffect)((()=>{if(r.status===`ready`){for(let e of r.data.currencies)new Image().src=e.logoURI;for(let e of Object.values(r.data.chains))new Image().src=e.iconUrl}}),[r]),t?(0,H.jsx)(ot,{}):null}};export{ct as default};