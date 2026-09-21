// Esqueletos: a forma do que vai aparecer enquanto os dados chegam. O texto para leitores de
// tela fica escondido; quem enxerga vê os blocos.
export function MessageSkeleton({ label = 'Carregando mensagens…' }: { label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {[62, 84, 48, 76, 55].map((width, index) => (
        <div className="skeleton-message" aria-hidden="true" key={index}>
          <span className="skeleton-block skeleton-avatar" />
          <div className="skeleton-lines">
            <span className="skeleton-block skeleton-name" />
            <span className="skeleton-block skeleton-line" style={{ width: `${width}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MemberSkeleton({ label = 'Carregando membros…' }: { label?: string }) {
  return (
    <div className="skeleton-list skeleton-members" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {[70, 55, 80, 60].map((width, index) => (
        <div className="skeleton-member" aria-hidden="true" key={index}>
          <span className="skeleton-block skeleton-avatar" />
          <span className="skeleton-block skeleton-line" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}
