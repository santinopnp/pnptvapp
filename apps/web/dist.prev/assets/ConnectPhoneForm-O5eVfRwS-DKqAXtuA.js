import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{w as t}from"./livekit-DxfWoNFy.js";import{i as n}from"./vendor-C-olS35e.js";import{$ as r,dt as i,it as a,k as o,mt as s,nt as c,rt as l,ut as u}from"./context-MM1cZbHj-D-btNsEz.js";import{i as d}from"./styled-components.browser.esm-CHmEdfXT.js";import{r as f}from"./useActiveWallet-3AK4h_3K-DcUS8cGq.js";import{a as p,u as m}from"./ModalFooter-DfVgQI26-Ccu9UnVQ.js";import{t as h}from"./Chip-CZKIKt9K-DNEmGYuC.js";var g=n(),_=e(t(),1),v=({value:e,onChange:t})=>(0,g.jsx)(`select`,{value:e,onChange:t,children:i.map((e=>(0,g.jsxs)(`option`,{value:e.code,children:[e.code,` +`,e.callCode]},e.code)))}),y=(0,_.forwardRef)(((e,t)=>{let n=o(),[i,d]=(0,_.useState)(!1),{accountType:y}=f(),[S,C]=(0,_.useState)(``),[w,T]=(0,_.useState)(e.defaultCountry??n?.intl.defaultCountry??`US`),E=r(S,w),D=a(w),O=c(w),k=s(w),A=!E,[j,M]=(0,_.useState)(!1),N=k.length,P=t=>{let n=t.target.value;T(n),C(``),e.onChange&&e.onChange({rawPhoneNumber:S,qualifiedPhoneNumber:u(S,n),countryCode:n,isValid:r(S,w)})},F=(t,n)=>{try{let i=t.replace(/\D/g,``)===S.replace(/\D/g,``)?t:D.input(t);C(i),e.onChange&&e.onChange({rawPhoneNumber:i,qualifiedPhoneNumber:u(t,n),countryCode:n,isValid:r(t,n)})}catch(e){console.error(`Error processing phone number:`,e)}},I=()=>{M(!0);let t=u(S,w);e.onSubmit({rawPhoneNumber:S,qualifiedPhoneNumber:t,countryCode:w,isValid:r(S,w)}).finally((()=>M(!1)))};return(0,_.useEffect)((()=>{if(e.defaultValue){let t=l(e.defaultValue);D.reset(),P({target:{value:t.countryCode}}),F(t.phone,t.countryCode)}}),[e.defaultValue]),(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)(b,{children:(0,g.jsxs)(x,{$callingCodeLength:N,$stacked:e.stacked,children:[(0,g.jsx)(v,{value:w,onChange:P}),(0,g.jsx)(`input`,{ref:t,id:`phone-number-input`,className:`login-method-button`,type:`tel`,placeholder:O,onFocus:()=>d(!0),onChange:e=>{F(e.target.value,w)},onKeyUp:e=>{e.key===`Enter`&&I()},value:S,autoComplete:`tel`}),y!==`phone`||i||e.hideRecent?e.stacked||e.noIncludeSubmitButton?(0,g.jsx)(`span`,{}):(0,g.jsx)(m,{isSubmitting:j,onClick:I,disabled:A,children:`Submit`}):(0,g.jsx)(h,{color:`gray`,children:`Recent`})]})}),e.stacked&&!e.noIncludeSubmitButton?(0,g.jsx)(p,{loading:j,loadingText:null,onClick:I,disabled:A,children:`Submit`}):null]})})),b=d.div`
  width: 100%;
`,x=d.label`
  --country-code-dropdown-width: calc(54px + calc(12 * ${e=>e.$callingCodeLength}px));
  --phone-input-extra-padding-left: calc(12px + calc(3 * ${e=>e.$callingCodeLength}px));
  display: block;
  position: relative;
  width: 100%;

  /* Tablet and Up */
  @media (min-width: 441px) {
    --country-code-dropdown-width: calc(52px + calc(10 * ${e=>e.$callingCodeLength}px));
  }

  && > select {
    font-size: 16px;
    height: 24px;
    position: absolute;
    margin: 13px calc(var(--country-code-dropdown-width) / 4);
    line-height: 24px;
    width: var(--country-code-dropdown-width);
    background-color: var(--privy-color-background);
    background-size: auto;
    background-position-x: right;
    cursor: pointer;

    /* Tablet and Up */
    @media (min-width: 441px) {
      font-size: 14px;
      width: var(--country-code-dropdown-width);
    }

    :focus {
      outline: none;
      box-shadow: none;
    }
  }

  && > input {
    font-size: 16px;
    line-height: 24px;
    color: var(--privy-color-foreground);

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    width: calc(100% - var(--country-code-dropdown-width));

    padding: 12px 88px 12px
      calc(var(--country-code-dropdown-width) + var(--phone-input-extra-padding-left));
    padding-right: ${e=>e.$stacked?`16px`:`88px`};
    flex-grow: 1;
    background: var(--privy-color-background);
    border: 1px solid var(--privy-color-foreground-4);
    border-radius: var(--privy-border-radius-md);
    width: 100%;

    :focus {
      outline: none;
      border-color: var(--privy-color-accent);
    }

    :autofill,
    :-webkit-autofill {
      background: var(--privy-color-background);
    }

    /* Tablet and Up */
    @media (min-width: 441px) {
      font-size: 14px;
      padding-right: 78px;
    }
  }

  && > :last-child {
    right: 16px;
    position: absolute;
    top: 50%;
    transform: translate(0, -50%);
  }

  && > button:last-child {
    right: 0px;
    line-height: 24px;
    padding: 13px 17px;

    :focus {
      outline: none;
      border-color: var(--privy-color-accent);
    }
  }

  && > input::placeholder {
    color: var(--privy-color-foreground-3);
  }
`;export{y as t};