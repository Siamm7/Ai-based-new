(() => {
"use strict";
const API=window.API_BASE_URL||"http://localhost:5000/api", $=id=>document.getElementById(id);
$("recruiterLoginForm").addEventListener("submit",async e=>{
 e.preventDefault();const button=$("recruiterLoginButton"),message=$("recruiterLoginMessage");button.disabled=true;message.textContent="Signing in…";
 try{
  const response=await fetch(API+"/recruiter/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("recruiterEmail").value.trim(),password:$("recruiterPassword").value})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"Login failed.");
  localStorage.removeItem("authToken");localStorage.removeItem("studentData");
  localStorage.setItem("recruiterToken",data.token);localStorage.setItem("recruiterData",JSON.stringify(data.recruiter));
  location.href="recruiter-dashboard.html";
 }catch(error){message.textContent=error.message;message.style.color="#b91c1c";}finally{button.disabled=false;}
});
})();