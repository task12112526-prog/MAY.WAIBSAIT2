function t(l){const n=[];let r=[],e="",f=!1;for(let s=0;s<l.length;s+=1){const i=l[s];f?i==='"'&&l[s+1]==='"'?(e+='"',s+=1):i==='"'?f=!1:e+=i:i==='"'&&e.length===0?f=!0:i===","?(r.push(e.trim()),e=""):i===`
`||i==="\r"?(i==="\r"&&l[s+1]===`
`&&(s+=1),r.push(e.trim()),r.some(o=>o!=="")&&n.push(r),r=[],e=""):e+=i}if(f)throw new Error("The CSV file has an unfinished quoted field.");return r.push(e.trim()),r.some(s=>s!=="")&&n.push(r),n}export{t as c};
