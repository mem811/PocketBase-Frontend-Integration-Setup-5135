import {useMemo,useState} from 'react';
import {formatDate} from '../lib/pocketbase';
import './ExerciseProgressChart.css';

const metrics=[
  {key:'weight',label:'Weight'},
  {key:'reps',label:'Reps'},
  {key:'sets',label:'Sets'},
  {key:'volume',label:'Volume'}
];

function numericValue(value){
  const number=Number.parseFloat(String(value??'').replace(/,/g,''));
  return Number.isFinite(number)?number:null;
}

function exerciseHistory(workouts){
  return workouts.flatMap((workout)=>(
    Array.isArray(workout.exercises)?workout.exercises:[]
  ).map((exercise)=>({
    date:workout.date,
    name:exercise.name?.trim(),
    weight:numericValue(exercise.weight),
    reps:numericValue(exercise.reps),
    sets:numericValue(exercise.sets)
  })).filter((exercise)=>exercise.name));
}

function valueFor(entry,metric){
  if(metric==='volume'){
    return entry.weight!==null&&entry.reps!==null&&entry.sets!==null
      ?entry.weight*entry.reps*entry.sets:null;
  }
  return entry[metric];
}

function Chart({entries,metric}){
  const width=620;
  const height=240;
  const points=entries.map((entry,index)=>{
    const x=entries.length===1?width/2:36+index*(width-72)/(entries.length-1);
    return {...entry,x,y:height-42-(entry.value/Math.max(...entries.map((item)=>item.value),1))*(height-82)};
  });
  const line=points.map((point)=>`${point.x},${point.y}`).join(' ');
  return <div className="progress-chart-wrap">
    <svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric} progress over time`}>
      <line x1="30" y1={height-42} x2={width-20} y2={height-42} className="chart-axis"/>
      <line x1="30" y1="20" x2="30" y2={height-42} className="chart-axis"/>
      {points.length>1&&<polyline points={line} className="chart-line"/>}
      {points.map((point,index)=><g key={`${point.date}-${index}`}>
        <circle cx={point.x} cy={point.y} r="6" className="chart-dot"/>
        <text x={point.x} y={point.y-13} textAnchor="middle" className="chart-value">{point.value}</text>
        <text x={point.x} y={height-18} textAnchor="middle" className="chart-date">{formatDate(point.date)}</text>
      </g>)}
    </svg>
  </div>;
}

export default function ExerciseProgressChart({workouts}){
  const history=useMemo(()=>exerciseHistory(workouts).sort((a,b)=>new Date(a.date)-new Date(b.date)),[workouts]);
  const exerciseNames=[...new Set(history.map((entry)=>entry.name))];
  const [exercise,setExercise]=useState('');
  const [metric,setMetric]=useState('weight');
  const activeExercise=exerciseNames.includes(exercise)?exercise:exerciseNames[0];
  const entries=history.filter((entry)=>entry.name===activeExercise)
    .map((entry)=>({...entry,value:valueFor(entry,metric)}))
    .filter((entry)=>entry.value!==null);

  return <section className="panel exercise-progress">
    <div className="panel-title"><div><h2>Exercise progress</h2><p>See how your logged work is changing over time.</p></div></div>
    {!exerciseNames.length?<div className="empty-state"><p>Log workouts with exercise details to start a progress chart.</p></div>:<>
      <div className="progress-chart-controls">
        <label>Exercise<select value={activeExercise} onChange={(event)=>setExercise(event.target.value)}>
          {exerciseNames.map((name)=><option key={name} value={name}>{name}</option>)}
        </select></label>
        <label>Track<select value={metric} onChange={(event)=>setMetric(event.target.value)}>
          {metrics.map((item)=><option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
      </div>
      {entries.length?<Chart entries={entries} metric={metric}/>:<div className="empty-state"><p>No {metric} values logged for this exercise yet.</p></div>}
    </>}
  </section>;
}
