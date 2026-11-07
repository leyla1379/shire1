/* Rewrites direct Supabase storage image URLs (stored inside DB rows) to the same-brand proxy host. */
(function(){
  var FROM="https://bporqhbfwhvuzfdxfrbi.supabase.co", TO="https://api.shirinkadeh-paris.ir";
  function fix(img){ try{ var s=img.getAttribute("src"); if(s&&s.indexOf(FROM)===0) img.setAttribute("src",TO+s.slice(FROM.length)); }catch(e){} }
  function scan(n){ if(n.nodeType!==1) return; if(n.tagName==="IMG") fix(n); else if(n.querySelectorAll) n.querySelectorAll("img").forEach(fix); }
  new MutationObserver(function(ms){ ms.forEach(function(m){ m.addedNodes.forEach(scan); if(m.type==="attributes") fix(m.target); }); })
    .observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["src"]});
})();
