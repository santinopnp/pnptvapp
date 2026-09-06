(function(){
  // Disable right-click context menu
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); return false; });
  // Block copy/print/save/inspect keyboard shortcuts
  document.addEventListener('keydown', function(e){
    var k = e.key ? e.key.toLowerCase() : '';
    if (e.ctrlKey && 'capsug'.includes(k)) { e.preventDefault(); return false; }
    if (e.key === 'F12') { e.preventDefault(); return false; }
    if (e.ctrlKey && e.shiftKey && 'ijc'.includes(k)) { e.preventDefault(); return false; }
  });
  // Block drag-to-copy
  document.addEventListener('dragstart', function(e){ e.preventDefault(); return false; });
  // Block clipboard copy
  document.addEventListener('copy', function(e){ e.preventDefault(); return false; });
}());
