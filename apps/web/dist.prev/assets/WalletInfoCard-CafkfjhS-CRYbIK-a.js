import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{w as t}from"./livekit-DxfWoNFy.js";import{i as n}from"./vendor-C-olS35e.js";import{i as r}from"./styled-components.browser.esm-CHmEdfXT.js";import{t as i}from"./check-BvyUOM6D.js";import{t as a}from"./copy-RD32JaY-.js";import{o}from"./ModalFooter-DfVgQI26-Ccu9UnVQ.js";import{t as s}from"./ErrorMessage-D8VaAP5m-RqTHBj2e.js";import{t as c}from"./shared-FM0rljBt-C2ZuChav.js";import{t as l}from"./Address-CfINu-yE-PGPQ5NCP.js";import{t as u}from"./LabelXs-oqZNqbm_-SerGvN8I.js";var d=n(),f=e(t(),1),p=r(c)`
  && {
    padding: 0.75rem;
    height: 56px;
  }
`,m=r.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,h=r.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`,g=r.div`
  font-size: 12px;
  line-height: 1rem;
  color: var(--privy-color-foreground-3);
`,_=r(u)`
  text-align: left;
  margin-bottom: 0.5rem;
`,v=r(s)`
  margin-top: 0.25rem;
`,y=r(o)`
  && {
    gap: 0.375rem;
    font-size: 14px;
  }
`,b=({errMsg:e,balance:t,address:n,className:r,title:o,showCopyButton:s=!1})=>{let[c,u]=(0,f.useState)(!1);return(0,f.useEffect)((()=>{if(c){let e=setTimeout((()=>u(!1)),3e3);return()=>clearTimeout(e)}}),[c]),(0,d.jsxs)(`div`,{children:[o&&(0,d.jsx)(_,{children:o}),(0,d.jsx)(p,{className:r,$state:e?`error`:void 0,children:(0,d.jsxs)(m,{children:[(0,d.jsxs)(h,{children:[(0,d.jsx)(l,{address:n,showCopyIcon:!1}),t!==void 0&&(0,d.jsx)(g,{children:t})]}),s&&(0,d.jsx)(y,{onClick:function(e){e.stopPropagation(),navigator.clipboard.writeText(n).then((()=>u(!0))).catch(console.error)},size:`sm`,children:(0,d.jsxs)(d.Fragment,c?{children:[`Copied`,(0,d.jsx)(i,{size:14})]}:{children:[`Copy`,(0,d.jsx)(a,{size:14})]})})]})}),e&&(0,d.jsx)(v,{children:e})]})};export{b as t};