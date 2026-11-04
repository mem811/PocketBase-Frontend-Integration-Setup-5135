import {useState} from 'react';
import {pb} from '../lib/pocketbase';

function localToday() {
  const now=new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function initialValues(workout) {
  return {
    date:String(workout?.date||localToday()).slice(0,10),
    notes:workout?.notes||'',
    exercises:Array.isArray(workout?.exercises)&&workout.exercises.length
      ? workout.exercises.map((exercise)=>({...exercise}))
      : [{name:'',sets:3,reps:12,weight:''}]
  };
}

function pocketBaseError(error) {
  const details=error?.response?.data
    ? Object.values(error.response.data).map((field)=>field?.message).filter(Boolean).join(' ')
    : '';
  return details||error?.response?.message||error?.message||'Could not save your workout.';
}

export default function WorkoutLogForm({workout,clientId,onSaved,onCancel,onError}) {
  const [values,setValues]=useState(()=>initialValues(workout));
  const [busy,setBusy]=useState(false);

  function updateExercise(index,key,value) {
    setValues((current)=>({...current,exercises:current.exercises.map((exercise,row)=>row===index?{...exercise,[key]:value}:exercise)}));
  }

  function addExercise() {
    setValues((current)=>({...current,exercises:[...current.exercises,{name:'',sets:3,reps:12,weight:''}]}));
  }

  function removeExercise(index) {
    setValues((current)=>({...current,exercises:current.exercises.filter((_,row)=>row!==index)}));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    onError('');
    const record={
      client:clientId,
      date:new Date(`${values.date}T12:00:00`).toISOString(),
      logged_by:'client',
      notes:values.notes,
      exercises:values.exercises.map((exercise)=>({
        name:exercise.name.trim(),
        sets:Number(exercise.sets)||0,
        reps:Number(exercise.reps)||0,
        weight:String(exercise.weight||'')
      }))
    };
    try {
      if(workout)await pb.collection('workouts').update(workout.id,record);
      else await pb.collection('workouts').create(record);
      await onSaved();
    } catch(error) {
      onError(pocketBaseError(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <form className="form-grid workout-form" onSubmit={submit}>
      <label className="form-span">Workout date<input type="date" required value={values.date} onChange={(event)=>setValues((current)=>({...current,date:event.target.value}))}/></label>
      <div className="form-span workout-exercise-list">
        {values.exercises.map((exercise,index)=><div className="workout-exercise-row" key={index}>
          <label>Exercise<input required value={exercise.name} placeholder="Goblet squat" onChange={(event)=>updateExercise(index,'name',event.target.value)}/></label>
          <label>Sets<input type="number" min="0" inputMode="numeric" value={exercise.sets} onChange={(event)=>updateExercise(index,'sets',event.target.value)}/></label>
          <label>Reps<input type="number" min="0" inputMode="numeric" value={exercise.reps} onChange={(event)=>updateExercise(index,'reps',event.target.value)}/></label>
          <label>Weight<input value={exercise.weight||''} placeholder="20 lb" onChange={(event)=>updateExercise(index,'weight',event.target.value)}/></label>
          {values.exercises.length>1&&<button type="button" className="text-button danger-text workout-remove" onClick={()=>removeExercise(index)}>Remove</button>}
        </div>)}
        <button type="button" className="text-button workout-add" onClick={addExercise}>+ Add exercise</button>
      </div>
      <label className="form-span">Notes<textarea value={values.notes} placeholder="How did it feel?" onChange={(event)=>setValues((current)=>({...current,notes:event.target.value}))}/></label>
      <button className="button button-primary form-span" disabled={busy}>{busy?'Saving…':workout?'Save workout':'Log workout'}</button>
      {workout&&<button type="button" className="text-button form-span workout-cancel" disabled={busy} onClick={onCancel}>Cancel editing</button>}
    </form>
  </section>;
}
