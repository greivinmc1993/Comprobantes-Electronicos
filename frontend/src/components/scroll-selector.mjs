/**
 * Un scroll dentro del selector o de su lista renderizada en portal debe
 * mantener el menú abierto. Los scrolls ajenos pueden desanclar el popup.
 */
export function scrollEsInterno(target, raiz, menu) {
  return Boolean(target && (raiz?.contains(target) || menu?.contains(target)));
}
