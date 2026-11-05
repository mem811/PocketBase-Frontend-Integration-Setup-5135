import * as ReactDOM from 'react-dom';

export default function StudioModal({title,children,onClose,closeDisabled=false}){
  return ReactDOM.createPortal(
    <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!closeDisabled)onClose();}}>
      <section className="panel form-panel studio-modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-title"><div><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={closeDisabled} aria-label="Close">×</button></div>
        {children}
      </section>
    </div>,
    document.body
  );
}
