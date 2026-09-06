import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{w as t}from"./livekit-DxfWoNFy.js";import{i as n}from"./vendor-C-olS35e.js";import"./context-MM1cZbHj-D-btNsEz.js";import{s as r}from"./privy-context-i6NfqAl1-D648CYIO.js";import{i,r as a,s as o}from"./styled-components.browser.esm-CHmEdfXT.js";import{f as s,s as c}from"./errors-DRgCdgfK-CWWxueFE.js";import{t as l}from"./modal-context-IJNBQScK-BcXJs4M4.js";import{i as u}from"./Loader-ekqMW2w--BC3DSiTe.js";import{r as d}from"./usePrivy-BtOaF7aD-B194Js4-.js";import{t as f}from"./createLucideIcon-J4i2xPyB.js";import{t as p}from"./circle-check-big-FCBKvtKd.js";import{t as m}from"./fingerprint-pattern-emIyfQ06.js";import{t as h}from"./ScreenLayout-BO5nCe4K-CrgqWtiC.js";import{n as g,t as _}from"./TodoList-CgrU7uwu-BCpgPAnB.js";var v=f(`trash-2`,[[`path`,{d:`M10 11v6`,key:`nco0om`}],[`path`,{d:`M14 11v6`,key:`outv1u`}],[`path`,{d:`M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6`,key:`miytrc`}],[`path`,{d:`M3 6h18`,key:`d0wm0j`}],[`path`,{d:`M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2`,key:`e791ji`}]]),y=n(),b=e(t(),1),x=({passkeys:e,name:t,isLoading:n,errorReason:r,success:i,expanded:a,onLinkPasskey:o,onUnlinkPasskey:s,onExpand:c,onBack:l,onClose:u})=>i?(0,y.jsx)(h,{title:`Passkeys updated`,icon:p,iconVariant:`success`,primaryCta:{label:`Done`,onClick:u},onClose:u,watermark:!0}):a?(0,y.jsx)(h,{icon:m,title:`Your passkeys`,onBack:l,onClose:u,watermark:!0,children:(0,y.jsx)(E,{passkeys:e,expanded:a,onUnlink:s,onExpand:c})}):(0,y.jsxs)(h,{icon:m,title:`Set up passkey verification`,subtitle:`Verify with passkey`,primaryCta:{label:`Add new passkey`,onClick:o,loading:n},onClose:u,watermark:!0,helpText:r||void 0,children:[e.length===0?(0,y.jsx)(D,{}):(0,y.jsx)(S,{children:(0,y.jsx)(E,{passkeys:e,expanded:a,onUnlink:s,onExpand:c})}),t?(0,y.jsxs)(C,{children:[(0,y.jsx)(w,{children:`New Passkey Name`}),(0,y.jsx)(T,{children:t})]}):null]}),S=i.div`
  margin-bottom: 0.75rem;
`,C=i.div`
  margin-top: 0.25rem;
`,w=i.div`
  color: var(--privy-color-foreground-2);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1rem;
  margin-bottom: 0.25rem;
`,T=i.div`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  line-height: 1.25rem;
`,E=({passkeys:e,expanded:t,onUnlink:n,onExpand:r})=>{let[i,a]=(0,b.useState)([]),o=t?e.length:2;return(0,y.jsxs)(`div`,{children:[(0,y.jsx)(N,{children:`Your passkeys`}),(0,y.jsxs)(M,{children:[e.slice(0,o).map((e=>{return(0,y.jsxs)(I,{children:[(0,y.jsxs)(`div`,{children:[(0,y.jsx)(P,{children:(t=e,t.authenticatorName?t.createdWithBrowser?`${t.authenticatorName} on ${t.createdWithBrowser}`:t.authenticatorName:t.createdWithBrowser?t.createdWithOs?`${t.createdWithBrowser} on ${t.createdWithOs}`:`${t.createdWithBrowser}`:`Unknown device`)}),(0,y.jsxs)(F,{children:[`Last used:`,` `,(e.latestVerifiedAt??e.firstVerifiedAt)?.toLocaleString()??`N/A`]})]}),(0,y.jsx)(R,{disabled:i.includes(e.credentialId),onClick:()=>(async e=>{a((t=>t.concat([e]))),await n(e),a((t=>t.filter((t=>t!==e))))})(e.credentialId),children:i.includes(e.credentialId)?(0,y.jsx)(u,{}):(0,y.jsx)(v,{size:16})})]},e.credentialId);var t})),e.length>2&&!t&&(0,y.jsx)(j,{onClick:r,children:`View all`})]})]})},D=()=>(0,y.jsxs)(_,{style:{color:`var(--privy-color-foreground)`},children:[(0,y.jsx)(g,{children:`Verify with Touch ID, Face ID, PIN, or hardware key`}),(0,y.jsx)(g,{children:`Takes seconds to set up and use`}),(0,y.jsx)(g,{children:`Use your passkey to verify transactions and login to your account`})]}),O={component:()=>{let{user:e}=r(),{unlink:t}=d(),{linkWithPasskey:n,closePrivyModal:i}=o(),{data:a}=l(),u=e?.linkedAccounts.filter((e=>e.type===`passkey`)),[f,p]=(0,b.useState)(!1),[m,h]=(0,b.useState)(``),[g,_]=(0,b.useState)(!1),[v,S]=(0,b.useState)(!1);return(0,b.useEffect)((()=>{u.length===0&&S(!1)}),[u.length]),(0,y.jsx)(x,{passkeys:u,name:a?.passkeyAuthModalData?.name,isLoading:f,errorReason:m,success:g,expanded:v,onLinkPasskey:()=>{p(!0),n({name:a?.passkeyAuthModalData?.name}).then((()=>_(!0))).catch((e=>{if(e instanceof s){if(e.privyErrorCode===c.CANNOT_LINK_MORE_OF_TYPE)return void h(`Cannot link more passkeys to account.`);if(e.privyErrorCode===c.PASSKEY_NOT_ALLOWED)return void h(`Passkey request timed out or rejected by user.`)}h(`Unknown error occurred.`)})).finally((()=>{p(!1)}))},onUnlinkPasskey:async e=>(p(!0),await t({credentialId:e}).then((()=>_(!0))).catch((e=>{e instanceof s&&e.privyErrorCode===c.MISSING_MFA_CREDENTIALS?h(`Cannot unlink a passkey enrolled in MFA`):h(`Unknown error occurred.`)})).finally((()=>{p(!1)}))),onExpand:()=>S(!0),onBack:()=>S(!1),onClose:()=>i()})}},k=i.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: 90px;
  border-radius: 50%;
  svg + svg {
    margin-left: 12px;
  }
  > svg {
    z-index: 2;
    color: var(--privy-color-accent) !important;
    stroke: var(--privy-color-accent) !important;
    fill: var(--privy-color-accent) !important;
  }
`,A=a`
  && {
    width: 100%;
    font-size: 0.875rem;
    line-height: 1rem;

    /* Tablet and Up */
    @media (min-width: 440px) {
      font-size: 14px;
    }

    display: flex;
    gap: 12px;
    justify-content: center;

    padding: 6px 8px;
    background-color: var(--privy-color-background);
    transition: background-color 200ms ease;
    color: var(--privy-color-accent) !important;

    :focus {
      outline: none;
      box-shadow: none;
    }
  }
`,j=i.button`
  ${A}
`,M=i.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.8rem;
  padding: 0.5rem 0rem 0rem;
  flex-grow: 1;
  width: 100%;
`,N=i.div`
  line-height: 20px;
  height: 20px;
  font-size: 1em;
  font-weight: 450;
  display: flex;
  justify-content: flex-beginning;
  width: 100%;
`,P=i.div`
  font-size: 1em;
  line-height: 1.3em;
  font-weight: 500;
  color: var(--privy-color-foreground-2);
  padding: 0.2em 0;
`,F=i.div`
  font-size: 0.875rem;
  line-height: 1rem;
  color: #64668b;
  padding: 0.2em 0;
`,I=i.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1em;
  gap: 10px;
  font-size: 0.875rem;
  line-height: 1rem;
  text-align: left;
  border-radius: 8px;
  border: 1px solid #e2e3f0 !important;
  width: 100%;
  height: 5em;
`,L=a`
  :focus,
  :hover,
  :active {
    outline: none;
  }
  display: flex;
  width: 2em;
  height: 2em;
  justify-content: center;
  align-items: center;
  svg {
    color: var(--privy-color-error);
  }
  svg:hover {
    color: var(--privy-color-foreground-3);
  }
`,R=i.button`
  ${L}
`;export{k as DoubleIconWrapper,j as LinkButton,O as LinkPasskeyScreen,O as default,x as LinkPasskeyView};