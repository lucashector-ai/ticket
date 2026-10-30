/*
 * Scripts escritos direto na página (sem arquivo). Ficam aqui para a política de segurança (CSP) liberar
 * exatamente este texto pelo hash: qualquer outro script na página sem o nonce do pedido é barrado.
 */

/** marca na sessão que o loader de entrada do evento já apareceu */
export const LD_KEY = "tw:ld";

/** Carga direta da página do evento: esconde o loader antes da primeira pintura se ele já apareceu nesta sessão. */
export const LD_SEEN_SCRIPT = `try{if(sessionStorage.getItem("${LD_KEY}")==="1"){var l=document.currentScript.previousElementSibling;if(l)l.style.display="none"}}catch(e){}`;
