import { firebaseConfig } from './firebase.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, runTransaction, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const OFFLINE = (firebaseConfig.apiKey === "SUA_API_KEY");

let app, auth, db;
try {
  app  = initializeApp(firebaseConfig);
  auth = OFFLINE ? null : getAuth(app);
  db   = OFFLINE ? null : getFirestore(app);
} catch (e) {
  console.warn("Inicialização em modo demonstração (sem Firebase).", e);
}

const LIMIT = 25;
const byId = (id)=>document.getElementById(id);
const msg = (id, html, cls='')=>{ const el=byId(id); if(!el) return; el.className=cls; el.innerHTML=html; };

// ===== Agendar Exame =====
window.agendarExame = async () => {
  const data  = byId('data')?.value;
  const nome  = byId('nome')?.value?.trim();
  const cpf   = byId('cpf')?.value?.replace(/\D/g,'');
  const exame = byId('exame')?.value;
  const lgpd  = byId('lgpd')?.checked;

  if(!data || !nome || !cpf){ return msg('msg','Preencha todos os campos.','alert alert-danger'); }
  if(cpf.length!==11){ return msg('msg','CPF inválido (11 números).','alert alert-danger'); }
  if(!lgpd){ return msg('msg','Você precisa aceitar o termo LGPD.','alert alert-danger'); }

  if(OFFLINE){
    const senha = Math.max(1, Math.min(25, Math.floor(Math.random()*25)+1));
    msg('msg', `🧪 (DEMO) Agendado! <strong>Sua senha: ${senha}</strong>`, 'alert alert-success');
    setVagasRestantesDemo(); 
    return;
  }

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
    msg('msg', `✅ Agendado! <strong>Sua senha: ${senha}</strong>`, 'alert alert-success');
    await vagasRestantes();
  }catch(e){
    msg('msg', e.message, 'alert alert-danger');
  }
};

// ===== Vagas Restantes =====
async function vagasRestantes(){
  const span = byId('vagasRestantes'); const input = byId('data');
  if(!span || !input) return;
  if(OFFLINE){ return setVagasRestantesDemo(); }
  try{
    const snap = await getDoc(doc(db,"examDays", input.value));
    if(snap.exists()){
      const d = snap.data(); const taken = d.taken ?? 0; const limit = d.limit ?? LIMIT;
      span.textContent = Math.max(0, limit - taken);
    } else {
      span.textContent = LIMIT;
    }
  }catch{ span.textContent = LIMIT; }
}
function setVagasRestantesDemo(){ const s=byId('vagasRestantes'); if(s) s.textContent = LIMIT; }

// ===== Inicialização da página de agendamento =====
function setHojeDefault(){
  const input = byId('data'); if(!input) return;
  const d=new Date(), yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  input.value = `${yyyy}-${mm}-${dd}`;
}
window.addEventListener('load', ()=>{
  setHojeDefault(); vagasRestantes();
  const di = byId('data'); if(di) di.addEventListener('change', vagasRestantes);
  const cpf = byId('cpf'); if(cpf) cpf.addEventListener('input', (e)=> e.target.value=e.target.value.replace(/\D/g,'').slice(0,11));
});

// ===== (Opcional) Minhas Senhas =====
window.buscarSenhas = async ()=>{
  const cpf = byId('cpfBusca')?.value?.replace(/\D/g,''); const box = byId('listaSenhas');
  if(!box) return; if(!cpf || cpf.length!==11){ box.innerHTML='<div class="text-danger">Informe um CPF válido (11 números).</div>'; return; }
  if(OFFLINE){ box.innerHTML='<div class="text-muted">🧪 (DEMO) Configure o Firebase para listar agendamentos.</div>'; return; }
  const qy = query(collection(db,"exames"), where("cpf","==",cpf), orderBy("data","desc"));
  const snap = await getDocs(qy);
  if(snap.empty){ box.textContent="Nenhum agendamento encontrado."; return; }
  box.innerHTML = snap.docs.map(d=>{ const x=d.data(); return `
    <div class="border rounded p-2 mb-2 bg-white">
      <div><strong>Data:</strong> ${x.data} — <strong>Senha:</strong> ${x.senha}</div>
      <div><strong>Exame:</strong> ${x.exame} — <strong>Status:</strong> ${x.status}</div>
    </div>`; }).join("");
};

// ===== (Opcional) Área da Equipe =====
window.login  = async ()=>{ if(OFFLINE) return alert("Ative Firebase para login."); const e=byId('email')?.value?.trim(); const s=byId('senha')?.value?.trim(); try{ await signInWithEmailAndPassword(auth,e,s);}catch(err){ alert(err.message); } };
window.logout = async ()=>{ if(OFFLINE) return; await signOut(auth); };
if(!OFFLINE && auth){
  onAuthStateChanged(auth, (user)=>{
    const painel=byId('painelEquipe'), loginBox=byId('loginBox');
    if(!painel||!loginBox) return;
    if(user){ painel.classList.remove('d-none'); loginBox.classList.add('d-none'); }
    else    { painel.classList.add('d-none'); loginBox.classList.remove('d-none'); }
  });
}
