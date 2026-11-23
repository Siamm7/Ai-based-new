(() => {
"use strict";
const API=window.API_BASE_URL||"http://localhost:5000/api", $=id=>document.getElementById(id);
const user=()=>{try{return JSON.parse(localStorage.getItem("recruiterData")||"null")}catch{return null}};
async function api(path,options={}){const headers={...(options.headers||{}),Authorization:"Bearer "+localStorage.getItem("recruiterToken")};if(options.body!==undefined)headers["Content-Type"]="application/json";const r=await fetch(API+path,{...options,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||"Request failed");return d;}
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let jobs=[],apps=[];
function stats(){$("rdJobs").textContent=jobs.length;$("rdApplicants").textContent=apps.length;$("rdPending").textContent=apps.filter(a=>a.status==="Pending").length;}
function renderJobs(){
 const box=$("rdJobsList");box.innerHTML="";
 if(!jobs.length){box.textContent="No jobs published yet.";return;}
 jobs.forEach(j=>{const card=document.createElement("article");card.className="rd-card";card.innerHTML="<h3>"+esc(j.title)+"</h3><p>"+esc(j.company)+" · "+esc(j.job_type||"Not specified")+" · "+esc(j.location||"Not specified")+"</p><p>"+esc(j.required_skills||"")+"</p>";box.appendChild(card);});
}
function renderApps(){
 const box=$("rdApplications");box.innerHTML="";
 if(!apps.length){box.textContent="No applications received for your jobs yet.";return;}
 apps.forEach(a=>{
  const card=document.createElement("article");card.className="rd-card";
  card.innerHTML="<h3>"+esc(a.full_name)+" · "+esc(a.title)+"</h3><p><b>Email:</b> "+esc(a.email)+" · <b>Company:</b> "+esc(a.company)+"</p>"+
   "<p><b>University:</b> "+esc(a.university||"Not provided")+" · <b>Department:</b> "+esc(a.department||"Not provided")+"</p>"+
   "<p><b>Skills:</b> "+esc(a.skills||"Not provided")+"</p><p><b>Applied:</b> "+esc(a.applied_at)+"</p>"+
   "<p><b>Cover letter:</b><br>"+esc(a.cover_letter||"Not provided")+"</p><p><b>Current status:</b> "+esc(a.status)+"</p>"+
   (a.resume_path?'<a href="#" data-resume="'+a.id+'">Download resume</a>':"<span class='rd-muted'>No resume uploaded</span>")+
   '<div><label for="rdStatus'+a.id+'">Update status</label> <select id="rdStatus'+a.id+'" data-status="'+a.id+'">'+["Pending","Reviewed","Accepted","Rejected"].map(s=>'<option '+(s===a.status?"selected":"")+'>'+s+'</option>').join("")+'</select><button data-save="'+a.id+'">Save status</button></div>';
  box.appendChild(card);
 });
}
async function load(){
 try{const pair=await Promise.all([api("/recruiter/jobs"),api("/recruiter/applications")]);jobs=pair[0].jobs||[];apps=pair[1].applications||[];stats();renderJobs();renderApps();}
 catch(e){$("rdApplications").textContent=e.message;if(e.message.toLowerCase().includes("approved recruiter"))location.href="recruiter-request.html";}
}
$("recruiterJobForm").addEventListener("submit",async e=>{
 e.preventDefault();const b=$("rdPublish");b.disabled=true;$("rdJobMessage").textContent="Publishing…";
 try{const d=await api("/recruiter/jobs",{method:"POST",body:JSON.stringify({title:$("rdTitle").value.trim(),company:$("rdCompany").value.trim(),job_type:$("rdType").value,location:$("rdLocation").value.trim(),required_skills:$("rdSkills").value.trim(),description:$("rdDescription").value.trim()})});$("rdJobMessage").textContent=d.message;$("recruiterJobForm").reset();await load();}
 catch(e){$("rdJobMessage").textContent=e.message;}finally{b.disabled=false;}
});
$("rdApplications").addEventListener("click",async e=>{
 const save=e.target.closest("[data-save]"),resume=e.target.closest("[data-resume]");
 if(save){const id=save.dataset.save;try{await api("/recruiter/applications/"+id,{method:"PUT",body:JSON.stringify({status:$("rdStatus"+id).value})});await load();}catch(err){alert(err.message);}}
 if(resume){e.preventDefault();try{const response=await fetch(API+"/recruiter/applications/"+resume.dataset.resume+"/resume",{headers:{Authorization:"Bearer "+localStorage.getItem("recruiterToken")}});if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.message||"Resume download failed");}const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="applicant-resume";a.click();URL.revokeObjectURL(url);}catch(err){alert(err.message);}}
});
const u=user();if(!localStorage.getItem("authToken")||!u)location.href="login.html";else if(u.role!=="recruiter")location.href=u.role==="admin"?"admin.html":"recruiter-request.html";else load();
})();