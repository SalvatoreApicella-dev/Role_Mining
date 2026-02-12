function s(c){const e=String(c??"");return e.includes(",")||e.includes('"')||e.includes(`
`)?`"${e.replace(/"/g,'""')}"`:e}function i(c,e,r){const o=[];o.push((e||[]).map(s).join(",")),(r||[]).forEach(d=>o.push((d||[]).map(s).join(",")));const a=new Blob([o.join(`
`)],{type:"text/csv;charset=utf-8;"}),t=URL.createObjectURL(a),n=document.createElement("a");n.href=t,n.download=c,document.body.appendChild(n),n.click(),n.remove(),URL.revokeObjectURL(t)}export{i as d};
