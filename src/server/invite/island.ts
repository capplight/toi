/**
 * The guest page's only JavaScript (brief §2: vanilla, ≤ 10 KB; plan 10: no React runtime). Inlined with a CSP nonce.
 * Without it the page still works: the envelope is skipped by <noscript>, the answer is a normal form POST.
 * Texts come from data-attributes rendered by the server (content/messages).
 */
export const ISLAND_JS = `(function(){
var d=document,h=d.documentElement,w=window,q=function(s){return d.querySelector(s)},qa=function(s){return d.querySelectorAll(s)};
var tok=h.getAttribute("data-token"),ck="inv_open_"+tok.slice(0,8);
function beacon(k){try{if(navigator.sendBeacon)navigator.sendBeacon("/api/i/"+tok+"/ping",k)}catch(e){}}
try{var lite=w.matchMedia&&w.matchMedia("(prefers-reduced-motion: reduce)").matches;var c=navigator.hardwareConcurrency,m=navigator.deviceMemory;if(lite||(c&&c<=4&&(m===undefined||m<=2)))h.classList.add("lite")}catch(e){}
var au=q("audio[data-src]"),mb=q("[data-music]"),playing=false;
function setBtn(on){playing=on;if(!mb)return;mb.setAttribute("aria-pressed",on?"true":"false");mb.setAttribute("aria-label",mb.getAttribute(on?"data-off":"data-on"));h.classList.toggle("music-on",on)}
function load(){if(au&&!au.src){au.src=au.getAttribute("data-src");au.preload="auto"}}
function play(){if(!au)return;load();var p=au.play();if(p&&p.then)p.then(function(){setBtn(true)},function(){setBtn(false)});else setBtn(true)}
if(au){w.addEventListener("load",function(){(w.requestIdleCallback||function(f){setTimeout(f,1200)})(load)})}
if(mb)mb.addEventListener("click",function(){if(!au)return;if(playing){au.pause();setBtn(false)}else play()});
var ob=q("#open");if(ob)ob.addEventListener("click",function(){h.classList.add("is-opening");play();beacon("envelope");try{d.cookie=ck+"=1; path=/i/; max-age=31536000; samesite=lax"}catch(e){}setTimeout(function(){h.classList.add("opened")},h.classList.contains("lite")?700:2300)});
beacon("opened");
var seats=q("#seats");qa("[data-step]").forEach(function(b){b.addEventListener("click",function(){var mx=+seats.max||20,mn=+seats.min||1;seats.value=Math.min(mx,Math.max(mn,(+seats.value||1)+(+b.getAttribute("data-step"))))})});
function sync(){var no=q("input[name=attending][value=no]");var box=q(".seats");if(box&&no)box.hidden=no.checked}
qa("input[name=attending]").forEach(function(r){r.addEventListener("change",sync)});sync();
var f=q("form.rsvp");if(f&&w.fetch&&w.FormData)f.addEventListener("submit",function(e){e.preventDefault();var btn=f.querySelector("[type=submit]"),err=f.querySelector(".err");var kids=Array.prototype.slice.call(btn.childNodes);btn.disabled=true;btn.textContent=btn.getAttribute("data-sending");if(err)err.hidden=true;
fetch(f.action,{method:"POST",body:new URLSearchParams(new FormData(f)),headers:{Accept:"application/json"},credentials:"same-origin"}).then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})}).then(function(x){if(x.j&&x.j.ok){w.location.replace(x.j.redirect);return}throw x}).catch(function(x){btn.disabled=false;btn.replaceChildren.apply(btn,kids);if(err){err.textContent=(x&&x.j&&x.j.message)||err.getAttribute("data-network");err.hidden=false}})});
if("IntersectionObserver" in w){var io=new IntersectionObserver(function(es){es.forEach(function(e){e.target.classList.toggle("paused",!e.isIntersecting)})});qa("[data-ambient]").forEach(function(el){io.observe(el)})}
d.addEventListener("visibilitychange",function(){h.classList.toggle("page-hidden",d.hidden);if(d.hidden&&au&&playing){au.pause();h.setAttribute("data-resume","1")}else if(!d.hidden&&h.getAttribute("data-resume")){h.removeAttribute("data-resume");play()}});
})();`;
