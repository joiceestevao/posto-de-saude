// app.js — funciona ONLINE (Firebase) e OFFLINE (demo no navegador)
// OFFLINE: usa localStorage para agendamentos e uma base local de 30 medicamentos

import { firebaseConfig } from './firebase.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy, runTransaction, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ========= Modo de operação =========
const isPlaceholderKey = (k)=> typeof k === 'string' && (k.startsWith('SUA_') || k.includes('SEU_PROJECT_ID'));
const OFFLINE = !firebaseConfig || !firebaseConfig.apiKey || isPlaceholderKey(firebaseConfig.apiKey);

let app, auth, db;
try {
  app  = initializeApp(firebaseConfig);
  auth = OFFLINE ? null : getAuth(app);
  db   = OFFLINE ? null : getFirestore(app);
} catch (e) {
  console.warn("Inicializando em modo DEMO (sem Firebase).", e);
}

// ========= Utilitários =========
const LIMIT = 25;
const byId = (id)=>document.getElementById(id);
const show = (id, html, cls='') => { const el=byId(id); if(!el) return; el.className=cls; el.innerHTML=html; };

// ========= DEMO: storage local =========
// examDays: { "YYYY-MM-DD": numberTaken }
// examesDemo: [ {cpf, data, exame, senha, status} ]
function demoGetDays(){ try { return JSON.parse(localStorage.getItem('examDays')||'{}'); } catch { return {}; } }
function demoSetDays(obj){ localStorage.setItem('examDays', JSON.stringify(obj)); }
function demoGetExames(){ try { return JSON.parse(localStorage.getItem('examesDemo')||'[]'); } catch { return []; } }
function demoSetExames(arr){ localStorage.setItem('examesDemo', JSON.stringify(arr)); }

// ========= Agendamento =========
window.agendarExame = async () => {
  const data  = byId('data')?.value;
  const nome  = byId('nome')?.value?.trim();
  const cpf   = byId('cpf')?.value?.replace(/\D/g,'');
  const exame = byId('exame')?.value;
  const lgpd  = byId('lgpd')?.checked;

  if(!data || !nome || !cpf || !exame){
    return show('msg','Preencha todos os campos.','alert alert-danger');
  }
  if(!/^\d{11}$/.test(cpf)){
    return show('msg','CPF inválido. Digite 11 números (sem pontos e traço).','alert alert-danger');
  }
  if(!lgpd){
    return show('msg','Você precisa aceitar o termo LGPD para continuar.','alert alert-danger');
  }

  // ----- OFFLINE (demo) -----
  if(OFFLINE){
    const days = demoGetDays();
    const taken = Number(days[data] || 0);
    if(taken >= LIMIT){
      return show('msg','Limite diário atingido para esta data. Tente outro dia.','alert alert-warning');
    }
    const senha = taken + 1;
    days[data] = senha;
    demoSetDays(days);

    const exames = demoGetExames();
    exames.push({ cpf, data, exame, senha, status: "confirmado" });
    demoSetExames(exames);

    show('msg', `✅ Agendado! <strong>Sua senha: ${senha}</strong> (Data: ${data}, Exame: ${exame})`, 'alert alert-success');
    await vagasRestantes();
    return;
  }

  // ----- ONLINE (Firebase) -----
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

// ========= Vagas Restantes =========
async function vagasRestantes(){
  const span = byId('vagasRestantes');
  const input = byId('data');
  if(!span || !input) return;

  // OFFLINE
  if(OFFLINE){
    const days = demoGetDays();
    const taken = Number(days[input.value] || 0);
    span.textContent = Math.max(0, LIMIT - taken);
    return;
  }

  // ONLINE
  try{
    const snap = await getDoc(doc(db,"examDays", input.value));
    if(snap.exists()){
      const d = snap.data();
      const taken = d.taken ?? 0;
      const limit = d.limit ?? LIMIT;
      span.textContent = Math.max(0, limit - taken);
    } else {
      span.textContent = LIMIT;
    }
  }catch{
    span.textContent = LIMIT;
  }
}

function setHojeDefault(){
  const input = byId('data'); if(!input) return;
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  input.value = `${yyyy}-${mm}-${dd}`;
}

// ========= Minhas Senhas =========
window.buscarSenhas = async ()=>{
  const cpf = byId('cpfBusca')?.value?.replace(/\D/g,'');
  const box = byId('listaSenhas');
  if(!box) return;

  if(!/^\d{11}$/.test(cpf)){
    box.innerHTML = '<div class="text-danger">Informe um CPF válido (11 números).</div>';
    return;
  }

  // OFFLINE
  if(OFFLINE){
    const exames = demoGetExames()
      .filter(x=>x.cpf===cpf)
      .sort((a,b)=> (a.data < b.data ? 1 : -1));

    if(exames.length===0){
      box.textContent = "Nenhum agendamento encontrado.";
      return;
    }
    box.innerHTML = exames.map(x=>`
      <div class="border rounded p-2 mb-2 bg-white">
        <div><strong>Data:</strong> ${x.data} — <strong>Sua senha:</strong> ${x.senha}</div>
        <div><strong>Exame:</strong> ${x.exame} — <strong>Status:</strong> ${x.status}</div>
      </div>
    `).join("");
    return;
  }

  // ONLINE
  try{
    const qy = query(collection(db,"exames"), where("cpf","==",cpf), orderBy("data","desc"));
    const snap = await getDocs(qy);
    if(snap.empty){
      box.textContent = "Nenhum agendamento encontrado.";
      return;
    }
    box.innerHTML = snap.docs.map(d=>{
      const x=d.data();
      return `
        <div class="border rounded p-2 mb-2 bg-white">
          <div><strong>Data:</strong> ${x.data} — <strong>Sua senha:</strong> ${x.senha}</div>
          <div><strong>Exame:</strong> ${x.exame} — <strong>Status:</strong> ${x.status}</div>
        </div>
      `;
    }).join("");
  }catch(e){
    box.textContent = e.message;
  }
};

// ========= Medicamentos (lista pública) =========
window.listarMedicamentos = async () => {
  const box = byId('listaMed');
  const termo = (byId('buscaMed')?.value || "").toLowerCase();
  if(!box) return;

  // OFFLINE: base local com 30 itens
  if(OFFLINE){
    const base = [
      { nome: "Paracetamol", dosagem: "500mg", disponivel: true,  quantidade: 30, atualizadoEm: new Date() },
      { nome: "Paracetamol", dosagem: "750mg", disponivel: true,  quantidade: 18, atualizadoEm: new Date() },
      { nome: "Dipirona", dosagem: "500mg", disponivel: true,  quantidade: 22, atualizadoEm: new Date() },
      { nome: "Dipirona", dosagem: "1g",    disponivel: false, quantidade: 0,  atualizadoEm: new Date() },
      { nome: "Ibuprofeno", dosagem: "400mg", disponivel: true,  quantidade: 12, atualizadoEm: new Date() },
      { nome: "Ibuprofeno", dosagem: "600mg", disponivel: false, quantidade: 0,  atualizadoEm: new Date() },
      { nome: "Amoxicilina", dosagem: "500mg", disponivel: true,  quantidade: 16, atualizadoEm: new Date() },
      { nome: "Amoxicilina + Clavulanato", dosagem: "875mg", disponivel: true, quantidade: 9, atualizadoEm: new Date() },
      { nome: "Azitromicina", dosagem: "500mg", disponivel: true, quantidade: 11, atualizadoEm: new Date() },
      { nome: "Cefalexina", dosagem: "500mg", disponivel: false, quantidade: 0, atualizadoEm: new Date() },
      { nome: "Loratadina", dosagem: "10mg", disponivel: true, quantidade: 25, atualizadoEm: new Date() },
      { nome: "Cetirizina", dosagem: "10mg", disponivel: true, quantidade: 20, atualizadoEm: new Date() },
      { nome: "Omeprazol", dosagem: "20mg", disponivel: true, quantidade: 28, atualizadoEm: new Date() },
      { nome: "Ranitidina", dosagem: "150mg", disponivel: false, quantidade: 0, atualizadoEm: new Date() },
      { nome: "Losartana", dosagem: "50mg", disponivel: true, quantidade: 19, atualizadoEm: new Date() },
      { nome: "Enalapril", dosagem: "10mg", disponivel: true, quantidade: 14, atualizadoEm: new Date() },
      { nome: "Hidroclorotiazida", dosagem: "25mg", disponivel: true, quantidade: 13, atualizadoEm: new Date() },
      { nome: "Metformina", dosagem: "500mg", disponivel: true, quantidade: 21, atualizadoEm: new Date() },
      { nome: "Metformina", dosagem: "850mg", disponivel: false, quantidade: 0, atualizadoEm: new Date() },
      { nome: "Glibenclamida", dosagem: "5mg", disponivel: true, quantidade: 10, atualizadoEm: new Date() },
      { nome: "Sinvastatina", dosagem: "20mg", disponivel: true, quantidade: 17, atualizadoEm: new Date() },
      { nome: "Atorvastatina", dosagem: "40mg", disponivel: false, quantidade: 0, atualizadoEm: new Date() },
      { nome: "Salbutamol", dosagem: "spray", disponivel: true, quantidade: 8, atualizadoEm: new Date() },
      { nome: "Beclometasona", dosagem: "spray", disponivel: true, quantidade: 6, atualizadoEm: new Date() },
      { nome: "Prednisona", dosagem: "20mg", disponivel: true, quantidade: 9, atualizadoEm: new Date() },
      { nome: "Prednisolona", dosagem: "5mg", disponivel: true, quantidade: 7, atualizadoEm: new Date() },
      { nome: "Diclofenaco", dosagem: "50mg", disponivel: false, quantidade: 0, atualizadoEm: new Date() },
      { nome: "Nimesulida", dosagem: "100mg", disponivel: true, quantidade: 10, atualizadoEm: new Date() },
      { nome: "Clonazepam", dosagem: "2mg", disponivel: false, quantidade: 0, atualizadoEm: new Date() },
      { nome: "Sertralina", dosagem: "50mg", disponivel: true, quantidade: 12, atualizadoEm: new Date() }
    ];

    const itens = base
      .filter(x => (`${x.nome} ${x.dosagem||''}`).toLowerCase().includes(termo))
      .sort((a,b)=> a.nome.localeCompare(b.nome));

    if(!itens.length){
      box.textContent = "Nenhum medicamento encontrado.";
      return;
    }

    box.innerHTML = itens.map(x=>`
      <div class="border rounded p-2 mb-2 bg-white">
        <div><strong>${x.nome}</strong> ${x.dosagem?`<span class="badge bg-light text-dark ms-2">${x.dosagem}</span>`:''}</div>
        <div>Disponível: <strong>${x.disponivel ? "Sim" : "Não"}</strong> ${Number.isFinite(x.quantidade)?`| Qtde: ${x.quantidade}`:''}</div>
        <small class="text-muted">Atualizado em: ${new Date(x.atualizadoEm).toLocaleString()}</small>
      </div>
    `).join("");
    return;
  }

  // ONLINE (Firebase)
  try{
    const qy = query(collection(db,"medicamentos"), orderBy("nome"));
    const snap = await getDocs(qy);
    const itens = snap.docs.map(d=>d.data())
      .filter(x => ((x.nome||'')+" "+(x.dosagem||'')).toLowerCase().includes(termo));
    if(!itens.length){ box.textContent = "Nenhum medicamento encontrado."; return; }
    box.innerHTML = itens.map(x=>`
      <div class="border rounded p-2 mb-2 bg-white">
        <div><strong>${x.nome}</strong> ${x.dosagem?`<span class="badge bg-light text-dark ms-2">${x.dosagem}</span>`:''}</div>
        <div>Disponível: <strong>${x.disponivel ? "Sim" : "Não"}</strong> ${x.quantidade?`| Qtde: ${x.quantidade}`:''}</div>
        <small class="text-muted">Atualizado em: ${x.atualizadoEm?.toDate? x.atualizadoEm.toDate().toLocaleString(): '-'}</small>
      </div>
    `).join("");
  }catch(e){
    box.textContent = e.message;
  }
};

// ========= Área da Equipe (apenas ONLINE; OFFLINE mostra alerta) =========
window.login  = async ()=>{
  if(OFFLINE) return alert("Ative o Firebase (firebase.js) para usar o login da equipe.");
  const email = byId('email')?.value?.trim();
  const senha = byId('senha')?.value?.trim();
  try{ await signInWithEmailAndPassword(auth, email, senha); }
  catch(err){ alert(err.message); }
};
window.logout = async ()=>{
  if(OFFLINE) return;
  await signOut(auth);
};
if(!OFFLINE && auth){
  onAuthStateChanged(auth, (user)=>{
    const painel=byId('painelEquipe'), loginBox=byId('loginBox');
    if(!painel||!loginBox) return;
    if(user){ painel.classList.remove('d-none'); loginBox.classList.add('d-none'); }
    else    { painel.classList.add('d-none'); loginBox.classList.remove('d-none'); }
  });
}

// ========= Inicialização por página =========
window.addEventListener('load', ()=>{
  // Agendamento
  if(byId('data')){
    setHojeDefault();
    vagasRestantes();
    byId('data').addEventListener('change', vagasRestantes);
  }
  if(byId('cpf')){
    byId('cpf').addEventListener('input', (e)=> e.target.value = e.target.value.replace(/\D/g,'').slice(0,11));
  }

  // Medicamentos
  if(byId('listaMed')) {
    listarMedicamentos();
  }
});
