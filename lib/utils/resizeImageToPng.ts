// Convierte cualquier imagen (JPG, foto de celular, lo que sea) a un PNG de
// tamaño acotado ANTES de subirla — corre en el navegador, con <canvas>.
// maxWidth = 480 por defecto: de sobra para 36-40px en el sidebar/login, y
// cómodo para un ticket térmico si algún print service del vertical activo
// lo consume más adelante.
export async function resizeImageToPng(file: File, maxWidth = 480): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo convertir la imagen"))),
      "image/png",
    );
  });
}
