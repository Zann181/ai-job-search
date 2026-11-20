import { useEffect, useRef } from "react"
import type { Job } from "../api"

export function ChromeDialog({ job, onCancel, onConfirm }: { job: Job; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return (
    <dialog ref={ref} className="dialog" onClose={onCancel} aria-labelledby="chrome-title">
      <h2 id="chrome-title">Postular con Chrome</h2>
      <p><strong>{job.title}</strong> · {job.company}</p>
      <ul>
        <li>Claude abre la oferta en tu Brave, con las sesiones que ya tienes, sube el CV confirmado y llena el formulario con tu perfil y tus respuestas guardadas.</li>
        <li><strong>No envía la postulación.</strong> Se detiene antes del botón final y deja la pestaña al frente: tú revisas y haces clic en <em>Postularme</em>.</li>
        <li>Cuando la envíes, pulsa <em>Ya la envié</em> en el panel de la oferta para marcarla como Aplicada.</li>
        <li>Si falta una respuesta, deja ese campo vacío y guarda la pregunta en Respuestas para que la contestes una vez.</li>
        <li>Si el portal usa el CV de tu perfil (Computrabajo), reemplaza ese archivo por el PDF confirmado y verifica que quedó.</li>
        <li>Brave te pedirá permitir la conexión: acepta. Si pide login o muestra un CAPTCHA, se detiene. No acepta términos ni autorizaciones por ti.</li>
      </ul>
      <div className="dialog-actions">
        <button className="secondary" onClick={onCancel}>Cancelar</button>
        <button className="primary" autoFocus onClick={onConfirm}>Abrir y llenar</button>
      </div>
    </dialog>
  )
}
