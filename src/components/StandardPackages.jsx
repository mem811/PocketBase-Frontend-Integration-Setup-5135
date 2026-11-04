import {useEffect,useState} from 'react';
import {pb} from '../lib/pocketbase';
import {pocketBaseErrorMessage} from '../lib/pocketbaseErrors';
import PackageTemplateEditor from './PackageTemplateEditor';

export default function StandardPackages() {
  const [templates,setTemplates]=useState([]);
  const [editing,setEditing]=useState(null);
  const [creating,setCreating]=useState(false);
  const [error,setError]=useState('');

  async function load() {
    const rows=await pb.collection('package_templates').getFullList({sort:'name'});
    setTemplates(rows);
  }

  useEffect(()=>{
    load().catch((err)=>setError(pocketBaseErrorMessage(err,err?.message||'Unable to load standard packages.')));
  },[]);

  async function saveTemplate(values) {
    setError('');
    try {
      if(values.is_default) {
        for(const item of templates) {
          if(item.is_default&&item.id!==editing?.id) {
            await pb.collection('package_templates').update(item.id,{is_default:false});
          }
        }
      }
      if(editing) await pb.collection('package_templates').update(editing.id,values);
      else await pb.collection('package_templates').create(values);
      setEditing(null);
      setCreating(false);
      await load();
    } catch(err) {
      const message=pocketBaseErrorMessage(err,err?.message||'Could not save this template.');
      setError(message);
      throw new Error(message);
    }
  }

  async function setDefault(template) {
    setError('');
    try {
      for(const item of templates) {
        if(item.is_default&&item.id!==template.id) {
          await pb.collection('package_templates').update(item.id,{is_default:false});
        }
      }
      await pb.collection('package_templates').update(template.id,{is_default:true});
      await load();
    } catch(err) {
      setError(pocketBaseErrorMessage(err,err?.message||'Could not update the default package.'));
    }
  }

  async function toggleActive(template) {
    setError('');
    try {
      await pb.collection('package_templates').update(template.id,{
        active:!template.active,
        ...(template.active&&template.is_default?{is_default:false}:{})
      });
      await load();
    } catch(err) {
      setError(pocketBaseErrorMessage(err,err?.message||'Could not update this package template.'));
    }
  }

  return <section className="panel section-gap">
    <div className="panel-title">
      <div><h2>Standard packages</h2><p>Reusable starting points; edits never change assigned packages.</p></div>
      <button className="button button-secondary button-small" onClick={()=>{setEditing(null);setCreating(true);}}>Add template</button>
    </div>
    {error&&<div className="notice notice-error">{error}</div>}
    {(creating||editing)&&<PackageTemplateEditor key={editing?.id||'new'} template={editing} onCancel={()=>{setEditing(null);setCreating(false);}} onSave={saveTemplate}/>}
    <div className="list-stack">
      {templates.map((template)=><div className="list-row template-row" key={template.id}>
        <div className="row-main"><strong>{template.name}{template.is_default?' · Default':''}</strong><span>{template.total_sessions} sessions · ${Number(template.price).toFixed(2)}{template.expiry_weeks?` · ${template.expiry_weeks} week expiry`:''} · {template.active?'Active':'Inactive'}</span></div>
        <div className="row-actions">
          {template.active&&!template.is_default&&<button className="text-button" onClick={()=>setDefault(template)}>Make default</button>}
          <button className="text-button" onClick={()=>{setCreating(false);setEditing(template);}}>Edit</button>
          <button className="text-button" onClick={()=>toggleActive(template)}>{template.active?'Deactivate':'Activate'}</button>
        </div>
      </div>)}
      {!templates.length&&!creating&&<div className="empty-state"><p>Create a standard package to make assigning plans quicker.</p></div>}
    </div>
  </section>;
}
