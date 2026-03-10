
let cards=[]
let index=0

async function boot(){

updateStatus("Carregando cartões...")

const files=[
"cards_part1.json",
"cards_part2.json",
"cards_part3.json",
"cards_part4.json"
]

let loaded=0

for(const f of files){

try{

const r=await fetch(f)
const j=await r.json()

cards.push(...j)

}catch(e){
console.warn("arquivo faltando",f)
}

loaded++
updateProgress((loaded/files.length)*100)

}

if(cards.length===0){

document.getElementById("status").innerText="Nenhum cartão encontrado"
return

}

startApp()

}

function startApp(){

document.getElementById("loader").classList.add("hidden")
document.getElementById("app").classList.remove("hidden")

showCard()

}

function showCard(){

const c=cards[index]

document.getElementById("question").innerHTML=c.question||""
document.getElementById("answer").innerHTML=c.answer||""
document.getElementById("answer").classList.add("hidden")

}

function showAnswer(){
document.getElementById("answer").classList.remove("hidden")
}

function nextCard(){

index++

if(index>=cards.length){
index=0
}

showCard()

}

function updateStatus(t){
document.getElementById("status").innerText=t
}

function updateProgress(p){
document.getElementById("progress").style.width=p+"%"
}

boot()
