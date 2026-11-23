(() => {
"use strict";
const API=window.API_BASE_URL||"http://localhost:5000/api";
const $=id=>document.getElementById(id);
const user=()=>{try{return JSON.parse(localStorage.getItem("studentData")||"null")}catch{return null}};
async function api(path,options={}){const headers={...(options.headers||{}),Authorization:"Bearer "+localStorage.getItem("authToken")};if(options.body!==undefined)headers["Content-Type"]="application/json";const r=await fetch(API+path,{...options,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||"Request failed");return d;}
function message(t,bad=false){$("requestMessage").textContent=t;$("requestMessage").style.color=bad?"#b91c1c":"#15803d";}
async function init(){
 if(!localStorage.getItem("authToken")||!user()){location.href="login.html";return;}
 if(user().role==="admin"){location.href="admin.html";return;}
 if(user().role==="recruiter"){location.href="recruiter-dashboard.html";return;}
 try{const d=await api("/recruiter/requests/me");const r=d.request;if(!r){$("requestStatus").textContent="No request submitted yet.";return;}
 $("requestStatus").textContent="Request status: "+r.status.toUpperCase()+" · Company: "+r.company_name;
 if(r.status==="pending")$("recruiterRequestForm").hidden=true;
 if(r.status==="approved")location.href="recruiter-dashboard.html";
 }catch(e){$("requestStatus").textContent=e.message;}
}
$("recruiterRequestForm").addEventListener("submit",async e=>{
 e.preventDefault();const b=$("requestSubmit");b.disabled=true;
 try{const d=await api("/recruiter/requests",{method:"POST",body:JSON.stringify({company_name:$("companyName").value.trim(),company_website:$("companyWebsite").value.trim(),contact_person:$("contactPerson").value.trim(),details:$("requestDetails").value.trim()})});
 message(d.message);$("requestStatus").textContent="Request status: PENDING";$("recruiterRequestForm").hidden=true;
 }catch(err){message(err.message,true);}finally{b.disabled=false;}
});
init();
})();