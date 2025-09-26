import { firebaseConfig } from './firebase.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, runTransaction, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== Configuração de operação =====
const OFFLINE = !firebaseConfig || firebaseConfig.apiKey === "SUA_API_KEY";
let app, auth, db;
try {
  app  = initializeApp(firebaseConfig);
  auth = OFFLINE ? null : getAuth(app);
  db   = OFFLINE ? null : getFirestore(app);
} catch (e) {
  console.warn("Inicialização em modo DEMO (sem Firebase).", e);
}

// ===== Util =====
const LIMIT = 25;
const byId = (id)=>document.getElementById(id);
const show = (id, html, cls='') => { const el=byId(id); if(!el) return; el.className=cls; el.innerHTML=html; };

// ======== DEMO (localStorage) ========
/* Guardamos dois itens:
   - examDays: { "YYYY-MM-DD": numberTaken }
   - examesDemo: [ {cpf, data, exame, senha, status} ]
*/
function demoGetDays(){
  try { return JSON.parse(localStorage.getItem('examDays')||'{}'); } catch { return {}; }
}
function demoSetDays(obj){
  localStorage.setItem('examDays', JSON.stringify(obj));
}
function demoGetExames(){
  try { return JSON.parse(localStorage.getItem('examesDemo')||'[]'); } catch { return []; }
}
function demoSetExames(arr){
  localStorage.setItem('examesDemo', JSON.stringify(arr));
}

// ===== Agendar Exame =====
window.agendarExame = async () => {
  const data  = byId('data')?.value;
  const nome  = byId('nome')?.value?.trim();
  const cpf   = byId('cpf')?.value?.replace(/\D/g,'');
  const exame = byId('exame')?.value;
  const lgpd  = byId('lgpd')?.checked;

  if(!data || !nome || !cpf){ return show('msg','Preencha todos os campos.','alert alert-danger'); }
  if(!/^\d{11}$/.test(cpf)){ return show('msg','CPF inválido (11 números).','alert alert-danger'); }
  if(!lgpd){ return show('msg','Você precisa aceitar o termo LGPD.','alert alert-danger'); }

  // ---- Modo DEMO ----
  if(OFFLINE){
    const days = demoGetDays();
    const taken = Number(days[data] || 0);
    if(taken >= LIMIT){ return show('msg','Limite diário atingido. Tente outra data.','alert alert-warning'); }
    const senha = taken + 1;
    days[data] = senha;
    demoSetDays(days);

    const exames = demoGetExames();
    exames.push({ cpf, data, exame, senha, status: "confirmado" });
    demoSetExames(exames);

    show('msg', `✅ Agendado! <strong>Sua senha: ${senha}</strong>`, 'alert alert-success');
    await vagasRestantes(); // atualiza contador
    return;
  }

  // ---- Modo Firebase ----
  try{
    const dayRef = doc(db, "examDays", data);
    const senha = await runTransaction(db, async (tx)=>{
      const snap = await tx.get(dayRef);
      let limit = LIMIT, taken = 0;
      if(snap.exists()){ const d=snap.data(); limit = d.limit ?? LIMIT; taken = d.taken ?? 0; }
      else { tx.set(dayRef, { limit: LIMIT, taken: 0 }); }
      if(taken >= limit) throw new Error("Limite diário atingido. Tente outra data.");
      const next = taken + 1;
      tx.update(dayRef, { taken: next });
      const exameRef = doc(collection(db,"exames"));
      tx.set(exameRef, { nome, cpf, exame, data, senha: next, status: "confirmado", criadoEm: serverTimestamp() });
      return next;
    });
    show('msg', `✅ Agendado! <strong>Sua senha: ${senha}</strong>`, 'alert alert-success');
    await vagasRestantes();
  }catch(e){
    show('msg', e.message, 'alert alert-danger');
  }
};

// ===== Vagas Restantes =====
async function vagasRestantes(){
  const span = byId('vagasRestantes'); const input = byId('data');
  if(!span || !input) return;

  if(OFFLINE){
    const days = demoGetDays();
    const taken = Number(days[input.value] || 0);
    span.textContent = Math.max(0, LIMIT - taken);
    return;
  }

  try{
    const snap = await getDoc(doc(db,"examDays", input.value));
    if(snap.exists()){
      const d = snap.data(); const taken = d.taken ?? 0; const limit = d.limit ?? LIMIT;
      span.textContent = Math.max(0, limit - taken);
    } else {
      span.textContent = LIMIT;
    }
  }catch{
    span.textContent = LIMIT;
  }
}

// ===== Inicialização da tela de agendamento =====
function setHojeDefault(){
  const input = byId('data'); if(!input) return;
  const d=new Date(), yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  input.value = `${yyyy}-${mm}-${dd}`;
}

window.addEventListener('load', ()=>{
  // Só executa nas páginas que têm esses elementos
  if(byId('data')) {
    setHojeDefault(); vagasRestantes();
    byId('data').addEventListener('change', vagasRestantes);
  if (document.getElementById('listaMed')) { listarMedicamentos(); }

  }
  const cpf = byId('cpf'); if(cpf) cpf.addEventListener('input', (e)=> e.target.value=e.target.value.replace(/\D/g,'').slice(0,11));
});

// ===== Minhas Senhas =====
window.buscarSenhas = async ()=>{
  const cpf = byId('cpfBusca')?.value?.replace(/\D/g,''); 
  const box = byId('listaSenhas');
  if(!box) return; 
  if(!/^\d{11}$/.test(cpf)){ box.innerHTML='<div class="text-danger">Informe um CPF válido (11 números).</div>'; return; }

  if(OFFLINE){
    const exames = demoGetExames().filter(x=>x.cpf===cpf).sort((a,b)=> (a.data<b.data?1:-1));
    if(exames.length===0){ box.textContent = "Nenhum agendamento encontrado."; return; }
    box.innerHTML = exames.map(x=>`
      <div class="border rounded p-2 mb-2 bg-white">
        <div><strong>Data:</strong> ${x.data} — <strong>Sua senha:</strong> ${x.senha}</div>
        <div><strong>Exame:</strong> ${x.exame} — <strong>Status:</strong> ${x.status}</div>
      </div>
    `).join("");
    return;
  }

  // Firebase
  try{
    const qy = query(collection(db,"exames"), where("cpf","==",cpf), orderBy("data","desc"));
    const snap = await getDocs(qy);
    if(snap.empty){ box.textContent="Nenhum agendamento encontrado."; return; }
    box.innerHTML = snap.docs.map(d=>{ const x=d.data(); return `
      <div class="border rounded p-2 mb-2 bg-white">
        <div><strong>Data:</strong> ${x.data} — <strong>Sua senha:</strong> ${x.senha}</div>
        <div><strong>Exame:</strong> ${x.exame} — <strong>Status:</strong> ${x.status}</div>
      </div>`; }).join("");
  }catch(e){
    box.textContent = e.message;
  }
};

// ===== Área da Equipe (opcional/Firebase) =====
window.login  = async ()=>{ if(OFFLINE) return alert("Ative o Firebase para login."); const e=byId('email')?.value?.trim(); const s=byId('senha')?.value?.trim(); try{ await signInWithEmailAndPassword(auth,e,s);}catch(err){ alert(err.message); } };
window.logout = async ()=>{ if(OFFLINE) return; await signOut(auth); };
if(!OFFLINE && auth){
  onAuthStateChanged(auth, (user)=>{
    const painel=byId('painelEquipe'), loginBox=byId('loginBox');
    if(!painel||!loginBox) return;
    if(user){ painel.classList.remove('d-none'); loginBox.classList.add('d-none'); }
    else    { painel.classList.add('d-none'); loginBox.classList.remove('d-none'); }
  });
}
