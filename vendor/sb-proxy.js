/* Rewrite product image URLs from both the current and legacy Supabase projects to the same-brand proxy host. */
(function(){
  var HOSTS=[
    "https://bporqhbfwhvuzfdxfrbi.supabase.co",
    "https://gppcrkyxthonpeyeuoyg.supabase.co"
  ];
  var TO="https://api.shirinkadeh-paris.ir";
  function fix(img){
    try{
      var s=img.getAttribute("src");
      if(!s) return;
      for(var i=0;i<HOSTS.length;i++){
        if(s.indexOf(HOSTS[i])===0){
          img.setAttribute("src",TO+s.slice(HOSTS[i].length));
          return;
        }
      }
    }catch(e){}
  }
  function scan(n){
    if(n.nodeType!==1) return;
    if(n.tagName==="IMG") fix(n);
    else if(n.querySelectorAll) n.querySelectorAll("img").forEach(fix);
  }
  new MutationObserver(function(ms){
    ms.forEach(function(m){
      m.addedNodes.forEach(scan);
      if(m.type==="attributes") fix(m.target);
    });
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["src"]});
})();
