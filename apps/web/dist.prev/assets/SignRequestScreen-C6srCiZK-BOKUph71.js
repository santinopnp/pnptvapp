import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{w as t}from"./livekit-DxfWoNFy.js";import{i as n}from"./vendor-C-olS35e.js";import{W as r,b as i,l as a}from"./context-MM1cZbHj-D-btNsEz.js";import{Zn as o,ur as s}from"./ccip-D0DqzNBh.js";import{r as c}from"./esm-DJNUAQDg.js";import{s as l}from"./privy-context-i6NfqAl1-D648CYIO.js";import{i as u,s as d}from"./styled-components.browser.esm-CHmEdfXT.js";import{l as f,n as p}from"./wallet-connect-CG7g6KCt-DFhWcNuL.js";import{t as m}from"./modal-context-IJNBQScK-BcXJs4M4.js";import{t as h}from"./createLucideIcon-J4i2xPyB.js";import{t as g}from"./ScreenLayout-BO5nCe4K-CrgqWtiC.js";import{t as _}from"./Layouts-BlFm53ED-Dbcp59Sy.js";import{t as v}from"./CopyToClipboard-DSTf_eKU-DR4Gs-RK.js";import{n as y,t as b}from"./JsonTree-aPaJmPx7-DgwrqU4q.js";var x=h(`square-pen`,[[`path`,{d:`M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7`,key:`1m0v6g`}],[`path`,{d:`M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z`,key:`ohrbg2`}]]),S=n(),C=e(t(),1),w=u.img`
  && {
    height: ${e=>e.size===`sm`?`65px`:`140px`};
    width: ${e=>e.size===`sm`?`65px`:`140px`};
    border-radius: 16px;
    margin-bottom: 12px;
  }
`,T=e=>{if(!s(e))return e;try{let t=o(e);return t.includes(`�`)?e:t}catch{return e}},E=e=>{try{let t=c.decode(e),n=new TextDecoder().decode(t);return n.includes(`�`)?e:n}catch{return e}},D=e=>{let{types:t,primaryType:n,...r}=e.typedData;return(0,S.jsxs)(S.Fragment,{children:[(0,S.jsx)(M,{data:r}),(0,S.jsx)(v,{text:(i=e.typedData,JSON.stringify(i,null,2)),itemName:`full payload to clipboard`}),` `]});var i},O=({method:e,messageData:t,copy:n,iconUrl:r,isLoading:i,success:a,walletProxyIsLoading:o,errorMessage:s,isCancellable:c,onSign:l,onCancel:u,onClose:d})=>(0,S.jsx)(g,{title:n.title,subtitle:n.description,showClose:!0,onClose:d,icon:x,iconVariant:`subtle`,helpText:s?(0,S.jsx)(j,{children:s}):void 0,primaryCta:{label:n.buttonText,onClick:l,disabled:i||a||o,loading:i},secondaryCta:c?{label:`Not now`,onClick:u,disabled:i||a||o}:void 0,watermark:!0,children:(0,S.jsxs)(_,{children:[r?(0,S.jsx)(w,{style:{alignSelf:`center`},size:`sm`,src:r,alt:`app image`}):null,(0,S.jsxs)(A,{children:[e===`personal_sign`&&(0,S.jsx)(N,{children:T(t)}),e===`eth_signTypedData_v4`&&(0,S.jsx)(D,{typedData:t}),e===`solana_signMessage`&&(0,S.jsx)(N,{children:E(t)})]})]})}),k={component:()=>{let{authenticated:e}=l(),{initializeWalletProxy:t,closePrivyModal:n}=d(),{navigate:o,data:s,onUserCloseViaDialogOrKeybindRef:c}=m(),[u,h]=(0,C.useState)(!0),[g,_]=(0,C.useState)(``),[v,y]=(0,C.useState)(),[b,x]=(0,C.useState)(null),[w,T]=(0,C.useState)(!1);(0,C.useEffect)((()=>{e||o(`LandingScreen`)}),[e]),(0,C.useEffect)((()=>{t(a).then((e=>{h(!1),e||(_(`An error has occurred, please try again.`),y(new f(new p(g,r.E32603_DEFAULT_INTERNAL_ERROR.eipCode))))}))}),[]);let{method:E,data:D,confirmAndSign:k,onSuccess:A,onFailure:j,uiOptions:M}=s.signMessage,N={title:M?.title||`Sign message`,description:M?.description||`Signing this message will not cost you any fees.`,buttonText:M?.buttonText||`Sign and continue`},P=e=>{e?A(e):j(v||new f(new p(`The user rejected the request.`,r.E4001_USER_REJECTED_REQUEST.eipCode))),n({shouldCallAuthOnSuccess:!1}),setTimeout((()=>{x(null),_(``),y(void 0)}),200)};return c.current=()=>{P(b)},(0,S.jsx)(O,{method:E,messageData:D,copy:N,iconUrl:M?.iconUrl&&typeof M.iconUrl==`string`?M.iconUrl:void 0,isLoading:w,success:b!==null,walletProxyIsLoading:u,errorMessage:g,isCancellable:M?.isCancellable,onSign:async()=>{T(!0),_(``);try{let e=await k();x(e),T(!1),setTimeout((()=>{P(e)}),i)}catch(e){console.error(e),_(`An error has occurred, please try again.`),y(new f(new p(g,r.E32603_DEFAULT_INTERNAL_ERROR.eipCode))),T(!1)}},onCancel:()=>P(null),onClose:()=>P(b)})}},A=u.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
`,j=u.p`
  && {
    margin: 0;
    width: 100%;
    text-align: center;
    color: var(--privy-color-error-dark);
    font-size: 14px;
    line-height: 22px;
  }
`,M=u(b)`
  margin-top: 0;
`,N=u(y)`
  margin-top: 0;
`;export{k as SignRequestScreen,k as default,O as SignRequestView};