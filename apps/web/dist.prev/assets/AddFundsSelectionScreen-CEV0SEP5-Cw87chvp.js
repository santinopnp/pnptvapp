import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{w as t}from"./livekit-DxfWoNFy.js";import{i as n,r}from"./vendor-C-olS35e.js";import{k as i}from"./context-MM1cZbHj-D-btNsEz.js";import{i as a}from"./styled-components.browser.esm-CHmEdfXT.js";import{d as o,j as s}from"./index-rkoxGjIC-DlKzwsq7.js";import{t as c}from"./modal-context-IJNBQScK-BcXJs4M4.js";import{t as l}from"./createLucideIcon-J4i2xPyB.js";import{t as u}from"./credit-card-YFpRG3l7.js";import{c as d,l as f,p,v as m}from"./styles-TJpjszba-ZHQDYKny.js";import{r as h}from"./styles-DVyDvTdj-Cm6y3anw.js";var g=l(`banknote`,[[`rect`,{width:`20`,height:`12`,x:`2`,y:`6`,rx:`2`,key:`9lu3g6`}],[`circle`,{cx:`12`,cy:`12`,r:`2`,key:`1c9p78`}],[`path`,{d:`M6 12h.01M18 12h.01`,key:`113zkx`}]]),_=n(),v=e(t(),1);r();var y={component:()=>{let e=o(),{onUserCloseViaDialogOrKeybindRef:t}=c(),n=i(),r=(0,v.useRef)(!1);(0,v.useEffect)((()=>{e&&(r.current=!1)}),[e]);let a=(0,v.useCallback)((async()=>{!r.current&&e&&(r.current=!0,s(),await e.onCancel())}),[e]);return(0,v.useEffect)((()=>(t.current=a,()=>{t.current===a&&(t.current=null)})),[a,t]),e?e.error?(0,_.jsx)(d,{icon:g,iconVariant:`warning`,title:`Unable to add funds`,subtitle:e.error,showClose:!0,onClose:a,primaryCta:{label:`Close`,onClick:a}}):(0,_.jsx)(d,{icon:g,iconVariant:`subtle`,title:`Select method`,subtitle:`Choose how to fund your wallet`,showClose:!0,onClose:a,children:(0,_.jsxs)(h,{style:{marginTop:`1rem`},$colorScheme:n.appearance.palette.colorScheme,children:[e.startFiat&&(0,_.jsxs)(f,{onClick:async()=>{r.current||(r.current=!0,await e.startFiat?.())},children:[(0,_.jsx)(b,{children:(0,_.jsx)(u,{})}),(0,_.jsxs)(x,{children:[(0,_.jsx)(p,{children:`Pay with fiat`}),(0,_.jsx)(S,{children:`Apple Pay, Google Pay, or debit card`})]})]}),e.startCrypto&&(0,_.jsxs)(f,{onClick:async()=>{r.current||(r.current=!0,await e.startCrypto?.())},children:[(0,_.jsx)(b,{children:(0,_.jsx)(m,{})}),(0,_.jsxs)(x,{children:[(0,_.jsx)(p,{children:`Transfer from wallet`}),(0,_.jsx)(S,{children:`Send crypto from any wallet`})]})]})]})}):null}},b=a.span`
  width: 2rem;
  height: 2rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-2);
  color: var(--color-icon-muted, #64668b);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`,x=a.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,S=a.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--privy-color-foreground-3);
`;export{y as AddFundsSelectionScreen,y as default};