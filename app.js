// app.js (ONLINE com Firestore 12.3.0)
import { db } from './firebase.js';
import {
  doc, getDoc, setDoc, runTransaction, serverTimestamp,
  collection, getDocs, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Util
const LIMIT = 25;
const $ = (id)=>document.getElementById(id);
const show = (id, html, cls='') => { const el=$(id); if(!el) return; el.className=cls; el.innerHTML=html; };

// Agendar
window.agendarExame = async () => {
  const data=$('data')?.value, nome=$('nome')?.value?.trim();
  const cpf=$('cpf')?.value?.replace(/\D/g,''), exame=$('exame')?.value;
  const lgpd=$('lgpd')?.checked;
  if(!data||!nome||!cpf||!exame) return show('msg','Preencha todos os campos.','alert alert-danger');
  if(!/^\d{11}$/.test(cpf))      return show('msg','CPF inválido. Use 11 números.','alert alert-danger');
  if(!lgpd)                      return show('msg','Aceite o termo LGPD.','alert alert-danger');

  try{
    const dayRef = doc(db, "examDays", data);
    const senha = await runTransaction(db, async (tx)=>{
      const snap = await tx.get(dayRef);
      let limit=LIMIT, taken=0;
      if(snap.exists()){ const d=snap.data(); limit=d.limit??LIMIT; taken=d.taken??0; }
      else { tx.set(dayRef, { limit: LIMIT, taken: 0 }); }
      if(taken>=limit) throw new Error("Limite diário atingido. Tente outra data.");
      const next = taken+1;
      tx.update(dayRef, { taken: next });
      const ref = doc(collection(db,"exames"));
      tx.set(ref, { nome, cpf, exame, data, senha: next, status:"confirmado", criadoEm: serverTimestamp() });
      return next;
    });
    show('msg', `✅ Agendado! <strong>Sua senha: ${senha}</strong>`, 'alert alert-success');
    await vagasRestantes();
  }catch(e){ show('msg', e.message, 'alert alert-danger'); }
};

// Vagas restantes
async function vagasRestantes(){
  const span=$('vagasRestantes'), input=$('data');
  if(!span||!input) return;
  try{
    const snap = await getDoc(doc(db,"examDays", input.value));
    if(snap.exists()){ const d=snap.data(); const taken=d.taken??0, limit=d.limit??LIMIT; span.textContent=Math.max(0,limit-taken); }
    else { span.textContent=LIMIT; }
  }catch{ span.textContent=LIMIT; }
}

// Minhas senhas
window.buscarSenhas = async ()=>{
  const cpf=$('cpfBusca')?.value?.replace(/\D/g,''), box=$('listaSenhas');
  if(!box) return;
  if(!/^\d{11}$/.test(cpf)){ box.innerHTML='<div class="text-danger">Informe um CPF válido (11 números).</div>'; return; }
  try{
    const qy = query(collection(db,"exames"), where("cpf","==",cpf), orderBy("data","desc"));
    const snap = await getDocs(qy);
    if(snap.empty){ box.textContent="Nenhum agendamento encontrado."; return; }
    box.innerHTML = snap.docs.map(d=>{ const x=d.data(); return `
      <div class="border rounded p-2 mb-2 bg-white">
        <div><strong>Data:</strong> ${x.data} — <strong>Sua senha:</strong> ${x.senha}</div>
        <div><strong>Exame:</strong> ${x.exame} — <strong>Status:</strong> ${x.status}</div>
      </div>`; }).join("");
  }catch(e){ box.textContent=e.message; }
};

// Medicamentos (lista pública)
window.listarMedicamentos = async ()=>{
  const termo=($('buscaMed')?.value||"").toLowerCase(), box=$('listaMed');
  if(!box) return;
  try{
    const qy = query(collection(db,"medicamentos"), orderBy("nome"));
    const snap = await getDocs(qy);
    const itens = snap.docs.map(d=>d.data())
      .filter(x=> ((x.nome||'')+" "+(x.dosagem||'')).toLowerCase().includes(termo));
    if(!itens.length){ box.textContent="Nenhum medicamento encontrado."; return; }
    box.innerHTML = itens.map(x=>`
      <div class="border rounded p-2 mb-2 bg-white">
        <div><strong>${x.nome}</strong> ${x.dosagem?`<span class="badge bg-light text-dark ms-2">${x.dosagem}</span>`:''}</div>
        <div>Disponível: <strong>${x.disponivel?"Sim":"Não"}</strong> ${x.quantidade?`| Qtde: ${x.quantidade}`:''}</div>
        <small class="text-muted">Atualizado em: ${x.atualizadoEm?.toDate? x.atualizadoEm.toDate().toLocaleString(): '-'}</small>
      </div>`).join("");
  }catch(e){ box.textContent=e.message; }
};

// Inicialização (data hoje + máscaras + auto-carregar lista)
function setHojeDefault(){
  const input=$('data'); if(!input) return;
  const d=new Date(); d.setHours(0,0,0,0);
  const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  const hoje=`${yyyy}-${mm}-${dd}`;
  input.value=hoje; input.min=hoje;
}

window.addEventListener('load', ()=>{
  if($('data')){ setHojeDefault(); vagasRestantes(); $('data').addEventListener('change', vagasRestantes); }
  if($('cpf')){ $('cpf').addEventListener('input', e=> e.target.value=e.target.value.replace(/\D/g,'').slice(0,11)); }
  if($('cpfBusca')){ $('cpfBusca').addEventListener('input', e=> e.target.value=e.target.value.replace(/\D/g,'').slice(0,11)); }
  if($('listaMed')){ listarMedicamentos(); }
});
