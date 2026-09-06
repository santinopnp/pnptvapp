import{i as e}from"./vendor-C-olS35e.js";import{i as t}from"./styled-components.browser.esm-CHmEdfXT.js";var n=e(),r=({success:e,fail:t})=>(0,n.jsxs)(a,{children:[(0,n.jsx)(i,{children:(0,n.jsx)(s,{className:e?`success`:t?`fail`:``})}),(0,n.jsx)(i,{children:(0,n.jsx)(o,{className:e?`success`:t?`fail`:``})})]}),i=t.span`
  && {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
  }
`,a=t.span`
  position: relative;
  width: 82px;
  height: 82px;
  display: inline-block;
`,o=t.span`
  && {
    width: 82px;
    height: 82px;
    border-width: 4px;
    border-style: solid;
    border-color: ${e=>e.color??`var(--privy-color-icon-subtle)`};
    border-bottom-color: transparent;
    border-radius: 50%;
    display: inline-block;
    box-sizing: border-box;
    animation: rotation 1.2s linear infinite;
    transition: border-color 800ms;
  }

  @keyframes rotation {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  &&&.success {
    border-color: var(--privy-color-icon-success);
    border-bottom-color: var(--privy-color-icon-success);
  }

  &&&.fail {
    border-color: var(--privy-color-icon-error);
    border-bottom-color: var(--privy-color-icon-error);
  }
`,s=t(o)`
  && {
    border-bottom-color: ${e=>e.color??`var(--privy-color-border-default)`};
    border-color: ${e=>e.color??`var(--privy-color-border-default)`};
    animation: none;
    opacity: 0.5;
  }
`,c=e=>(0,n.jsx)(l,{color:e.color||`var(--privy-color-foreground-3)`}),l=t(o)`
  && {
    height: 1rem;
    width: 1rem;
    margin: 2px 0;
    border-width: 1.5px;

    /* Override default Loader to match button transitions */
    transition: border-color 200ms ease;
  }
`;export{c as i,s as n,r,o as t};