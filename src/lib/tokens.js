/* Cyber Obsidian design tokens — injected as <style> in root */
export const CSS_TOKENS = `
:root {
  --surface:#131313; --s-deep:#0e0e0e; --s-low:#1c1b1b; --s-mid:#201f1f;
  --s-high:#2a2a2a; --s-top:#353534;
  --amber:#ffbf00; --amber-light:#ffe2ab; --amber-dim:#fbbc00;
  --amber-lo:rgba(255,191,0,0.06); --amber-glow:rgba(255,191,0,0.22);
  --on-amber:#402d00;
  --on-s:#e5e2e1; --on-sv:#d4c5ab;
  --outline:#9c8f78; --outline-v:#504532;
  --blue:#3b82f6; --purple:#8b5cf6; --red:#ef4444;
  --green:#22c55e; --cyan:#06b6d4; --pink:#ec4899;
}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;overscroll-behavior:none;}
body{background:var(--surface);color:var(--on-s);font-family:'Inter',sans-serif;-webkit-tap-highlight-color:transparent;}
.hl{font-family:'Space Grotesk',sans-serif;}
.mono{font-family:'JetBrains Mono',monospace;}
.msym{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;
  line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;
  white-space:nowrap;-webkit-font-smoothing:antialiased;}
input,textarea,select{background:var(--s-high);border:none;color:var(--on-s);
  padding:12px 14px;font-family:'Inter',sans-serif;font-size:14px;outline:none;
  width:100%;transition:background .15s;border-radius:0;}
input:focus,textarea:focus,select:focus{background:var(--s-top);}
select option{background:var(--s-high);}
input[type="range"]{padding:0;height:4px;accent-color:var(--amber);cursor:pointer;}
input[type="number"]{text-align:center;}
button{cursor:pointer;border:none;font-family:'Inter',sans-serif;transition:opacity .1s,transform .08s;-webkit-tap-highlight-color:transparent;}
button:active{opacity:.82;transform:scale(.97);}
::-webkit-scrollbar{width:2px;height:2px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--s-top);}
.no-sb::-webkit-scrollbar{display:none;}
.no-sb{-ms-overflow-style:none;scrollbar-width:none;}

@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes slideDown{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}
@keyframes countIn{0%{transform:scale(.55);opacity:0}30%{transform:scale(1.18);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes beatPop{0%{transform:scale(1)}20%{transform:scale(1.5)}100%{transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes amberPulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes checkDraw{to{stroke-dashoffset:0}}
@keyframes tabFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes beatFlash{0%{opacity:.7}100%{opacity:0}}
@keyframes pendulum{0%{transform:rotate(-30deg)}50%{transform:rotate(30deg)}100%{transform:rotate(-30deg)}}
@keyframes scaleIn{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}
`;
