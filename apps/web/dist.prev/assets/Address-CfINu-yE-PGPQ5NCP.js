import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{w as t}from"./livekit-DxfWoNFy.js";import{i as n}from"./vendor-C-olS35e.js";import{i as r}from"./styled-components.browser.esm-CHmEdfXT.js";import{p as i}from"./storage-ClxaIe6D-Cc15ifxP.js";import{t as a}from"./check-BvyUOM6D.js";import{t as o}from"./copy-RD32JaY-.js";import{o as s}from"./ModalFooter-DfVgQI26-Ccu9UnVQ.js";var c=n(),l=e(t(),1),u=({address:e,showCopyIcon:t,url:n,className:r})=>{let[u,m]=(0,l.useState)(!1);function h(t){t.stopPropagation(),navigator.clipboard.writeText(e).then((()=>m(!0))).catch(console.error)}return(0,l.useEffect)((()=>{if(u){let e=setTimeout((()=>m(!1)),3e3);return()=>clearTimeout(e)}}),[u]),(0,c.jsxs)(d,n?{children:[(0,c.jsx)(p,{title:e,className:r,href:`${n}/address/${e}`,target:`_blank`,children:i(e)}),t&&(0,c.jsx)(s,{onClick:h,size:`sm`,style:{gap:`0.375rem`},children:(0,c.jsxs)(c.Fragment,u?{children:[`Copied`,(0,c.jsx)(a,{size:16})]}:{children:[`Copy`,(0,c.jsx)(o,{size:16})]})})]}:{children:[(0,c.jsx)(f,{title:e,className:r,children:i(e)}),t&&(0,c.jsx)(s,{onClick:h,size:`sm`,style:{gap:`0.375rem`,fontSize:`14px`},children:(0,c.jsxs)(c.Fragment,u?{children:[`Copied`,(0,c.jsx)(a,{size:14})]}:{children:[`Copy`,(0,c.jsx)(o,{size:14})]})})]})},d=r.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`,f=r.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,p=r.a`
  font-size: 14px;
  color: var(--privy-color-foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;export{u as t};