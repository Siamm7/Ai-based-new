(() => {
"use strict";
const API=window.API_BASE_URL||"http://localhost:5000/api", $=id=>document.getElementById(id);
$("recruiterRegisterForm").addEventListener("submit",async e=>{
 e.preventDefault();const button=$("rrSubmit"),message=$("rrMessage"),file=$("rrProof").files[0];if(!file){message.textContent="Please upload a verification document.";return;}
 if(file.size>5*1024*1024){message.textContent="The document must be 5 MB or smaller.";return;}
 button.disabled=true;message.textContent="Submitting registration…";
 try{
  const body=new FormData();for(const [id,name] of [["rrName","full_name"],["rrEmail","email"],["rrPassword","password"],["rrPhone","phone"],["rrCompany","company_name"],["rrWebsite","company_website"],["rrPosition","job_title"]])body.append(name,$(id).value.trim());
  body.append("verification_document",file);
  const response=await fetch(API+"/recruiter/register",{method:"POST",body});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"Registration failed.");
  $("recruiterRegisterForm").reset();message.textContent=data.message+" Go to Recruiter Login after approval.";message.style.color="#15803d";
 }catch(error){message.textContent=error.message;message.style.color="#b91c1c";}finally{button.disabled=false;}
});
})();