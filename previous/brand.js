/* PrepLine by Autoprod brand mark. Decorative only: pointer-events:none, in normal page flow as a
   centred footer (never floats over controls). Also added inside full-screen panels, and printed
   small at the foot of every printed page. */
(function(){
  var Y=new Date().getFullYear(), TXT='PrepLine by Autoprod \u00a9 '+Y;
  var CSS='.pl-brand{display:block;position:static;clear:both;margin:18px auto 10px;padding:6px 0 calc(6px + env(safe-area-inset-bottom,0px));text-align:center;pointer-events:none!important;user-select:none;-webkit-user-select:none;'+
   'font:600 11px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.03em;color:#1f2a37;opacity:.5;background:none;white-space:nowrap}'+
   '@media print{.pl-brand{display:block!important;visibility:visible!important;position:fixed;left:0;right:0;bottom:0;margin:0;padding:0;opacity:.6;font-size:7pt}}';
  function el(){var d=document.createElement('footer');d.className='pl-brand';d.setAttribute('aria-hidden','true');d.textContent=TXT;return d;}
  function printMark(){return '<style>'+CSS+'</style><footer class="pl-brand" aria-hidden="true">'+TXT+'</footer>';}
  function add(){
    if(!document.getElementById('plBrandCss')){var s=document.createElement('style');s.id='plBrandCss';s.textContent=CSS;document.head.appendChild(s);}
    var last=document.body.lastElementChild;var main=document.querySelector('body>.pl-brand');
    if(!main)document.body.appendChild(el());
    /* full-screen panels opened over the page get their own footer at the end of their content */
    ['pbPanel','asisView'].forEach(function(id){var p=document.getElementById(id);if(p&&!p.querySelector(':scope>.pl-brand'))p.appendChild(el());});
  }
  window.PrepLineBrand={text:TXT,printMark:printMark,
    addToHtml:function(h){return /class="pl-brand"/.test(h)?h:(/<\/body>/i.test(h)?h.replace(/<\/body>(?![\s\S]*<\/body>)/i,printMark()+'</body>'):h+printMark());}};
  function start(){add();new MutationObserver(function(){add();}).observe(document.body,{childList:true});setInterval(add,1000);}
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
})();
