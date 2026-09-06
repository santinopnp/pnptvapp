import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{w as t}from"./livekit-DxfWoNFy.js";import{i as n}from"./vendor-C-olS35e.js";import{k as r}from"./context-MM1cZbHj-D-btNsEz.js";import{qn as i}from"./ccip-D0DqzNBh.js";import{f as a}from"./privy-context-i6NfqAl1-D648CYIO.js";import{i as o,r as s,s as c}from"./styled-components.browser.esm-CHmEdfXT.js";import{t as l}from"./react-D_IUpjor.js";import{b as u,t as d}from"./storage-ClxaIe6D-Cc15ifxP.js";import{d as f}from"./wallet-connect-CG7g6KCt-DFhWcNuL.js";import"./index-DKna0vBk-BXh6ROHg.js";import{f as p}from"./use-unlink-wallet-DZG621QK-BLNNOu5e.js";import"./get-entropy-details-for-user-Bq7nAeEf-C0g0KbEL.js";var m=e(t(),1),h=n(),g=e=>{let[t,n]=(0,m.useState)(`auto`);return(0,m.useEffect)((()=>{let t=new ResizeObserver((e=>{n(e[0]?.contentRect.height??`auto`)}));return e.current&&t.observe(e.current),()=>{e.current&&t.unobserve(e.current)}}),[e.current]),t},_=o.div`
  text-align: left;
  flex-grow: 1;
`,v=o.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  flex-grow: 1;
`,y=o.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  /* for Internet Explorer, Edge */
  -ms-overflow-style: none;

  /* for Firefox */
  scrollbar-width: none;

  /* for Chrome, Safari, and Opera */
  &::-webkit-scrollbar {
    display: none;
  }
`,b=o(y)`
  ${e=>e.$colorScheme===`light`?`background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0.06)) bottom;`:e.$colorScheme===`dark`?`background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.06)) bottom;`:void 0}

  background-repeat: no-repeat;
  background-size:
    100% 32px,
    100% 16px;
  background-attachment: local, scroll;
  max-height: 400px;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 3px;
`,x=s`
  && {
    width: 100%;
    font-size: 16px;
    line-height: 24px;
    min-height: 56px;

    /* Tablet and Up */
    @media (min-width: 440px) {
      font-size: 14px;
    }

    display: flex;
    gap: 12px;
    align-items: center;
    color: var(--privy-color-foreground);

    padding: 10px 12px;
    border: 1px solid var(--privy-color-foreground-4) !important;
    border-radius: var(--privy-border-radius-md);
    transition: background-color 200ms ease;

    cursor: pointer;

    &:hover {
      background-color: var(--privy-color-background-2);
    }

    &:disabled {
      cursor: pointer;
      background-color: var(--privy-color-background-2);
    }
  }
`,S=o.div`
  text-align: center;
  font-size: 14px;
  margin-bottom: 24px;
`,C=o.button.attrs({className:`login-method-button`})`
  ${x}
`;o.a`
  ${x}
`;var w=o.div`
  width: 32px;
  height: 32px;
  border-radius: ${e=>e.$fullSize?`0`:`4px`};
  background: ${e=>e.$fullSize?`transparent`:`var(--privy-color-background-2)`};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: ${e=>e.$fullSize?`32px`:`18px`};
    height: ${e=>e.$fullSize?`32px`:`18px`};
    color: ${e=>e.$fullSize?`inherit`:`var(--privy-color-icon-muted)`};
  }
`,T=o.div`
  width: 100%;
  height: 100%;
  min-height: inherit;
  display: flex;
  flex-direction: column;
  ${e=>e.$if?`display: none;`:``}
`,E=o.div`
  width: 100%;
  height: 100%;
  padding: ${e=>e.$withPadding?`64px 0px`:`0px`};
`,D=o.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
  gap: 12px;
  & h3 {
    font-size: 18px;
    font-style: normal;
    font-weight: 600;
    line-height: 24px;
  }
  & p {
    max-width: 300px;
    font-size: 14px;
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }
`;async function O(e,t,n){if(!t.shouldEnforceDefaultChainOnConnect)return;let r=Number(e.chainId.replace(`eip155:`,``));if(!t.chains.find((e=>e.id===r))&&(e.connectorType!==`wallet_connect_v2`||e.walletClientType!==`metamask`)){n?.();try{await e.switchChain(t.defaultChain.id),e.chainId=u(i(t.defaultChain.id))}catch{f.warn(`Unable to switch to default chain after connect`,{chainId:t.defaultChain.id})}}}var k=(0,m.createContext)({}),A=({children:e})=>{let t=r(),[n,i]=(0,m.useState)({});return p(`login`,{onComplete:({loginAccount:e})=>{e&&e.type!==`passkey`&&e.type!==`cross_app`&&(e.type!==`wallet`||e.walletClientType!==`privy`)&&(d.put(j(t.id),e.type),e.type===`wallet`?(d.put(M(t.id),e.walletClientType),d.put(N(t.id),e.chainType),i({accountType:e.type,walletClientType:e.walletClientType,chainType:e.chainType})):(d.del(M(t.id)),d.del(N(t.id)),i({accountType:e.type})))}}),(0,m.useEffect)((()=>{if(!t.id)return;let e=d.get(j(t.id)),n=d.get(M(t.id)),r=d.get(N(t.id));e&&i(e===`wallet`?{accountType:e,walletClientType:n,chainType:r}:{accountType:e})}),[t.id]),(0,h.jsx)(k.Provider,{value:n,children:e})},j=e=>`privy:${e}:recent-login-method`,M=e=>`privy:${e}:recent-login-wallet-client`,N=e=>`privy:${e}:recent-login-chain-type`,P=()=>(0,m.useContext)(k),F=e=>{p(`fundWallet`,e);let{fundWallet:t}=c();return{fundWallet:({address:e,options:n})=>t(e,n)}};function I(e){let{logout:t}=(0,m.useContext)(a);return p(`logout`,e),{logout:t}}function L(e){let{connectWallet:t}=(0,m.useContext)(a);return p(`connectWallet`,e),{connectWallet:t}}var R=l((()=>({isModalOpen:!1,resolvers:null})));l((()=>({})));var z=({address:e,client:t,appId:n})=>{let r=`${t}:${e}`;n&&d.put(B(n),r),R.setState({wallet:r})},B=e=>`privy:${e}:active-wallet-connection`;export{L as _,F as a,D as c,A as d,v as f,g,z as h,E as i,T as l,w as m,b as n,I as o,y as p,P as r,C as s,_ as t,O as u,S as v};