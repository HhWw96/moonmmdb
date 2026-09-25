import type {Database} from './protocol';
export type AnalysisForm = {file: File|null; city: number; asn: number; ipPath: string; top: string; maxMiB: string; maxRecords: string};
export const initialAnalysis: AnalysisForm = {file:null,city:0,asn:1,ipPath:'/ip',top:'10',maxMiB:'8',maxRecords:'10000'};
export function AnalysisFields({value,change,databases}: {value: AnalysisForm; change:(value:AnalysisForm)=>void; databases:Database[]}) {
  const update=(part:Partial<AnalysisForm>)=>change({...value,...part});
  return <>
    <div className="analysis-roles">{(['city','asn'] as const).map(role=><label key={role}>{role==='city'?'City 角色':'ASN 角色'}<select aria-label={role==='city'?'City 角色':'ASN 角色'} value={value[role]} onChange={e=>update({[role]:Number(e.target.value)})}>{[0,1].map(i=><option key={i} value={i}>数据库 {i===0?'A':'B'}{databases[i]?` · ${databases[i].name}`:'（未加载）'}</option>)}</select></label>)}</div>
    <label className="log-file" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!e.currentTarget.closest('fieldset')?.disabled&&e.dataTransfer.files.length===1)update({file:e.dataTransfer.files[0]});}}>
      选择或拖放一个 JSONL 日志<input aria-label="选择 JSONL 日志" type="file" accept=".jsonl,.ndjson,.json" onChange={e=>{update({file:e.target.files?.[0]??null});e.target.value='';}}/>
      <span>{value.file?`${value.file.name} · ${value.file.size.toLocaleString()} 字节`:'每行一个 JSON 对象，仅在本机分析'}</span>
    </label>
    <div className="analysis-roles"><label>IP 字段路径<input aria-label="IP 字段路径" value={value.ipPath} spellCheck={false} onChange={e=>update({ipPath:e.target.value})}/></label><label>Top N<input aria-label="Top N" type="number" min="1" max="100" step="1" value={value.top} onChange={e=>update({top:e.target.value})}/></label></div>
    <details className="limits"><summary>日志资源限制</summary><label>最大日志大小（MiB，1—64）<input aria-label="最大日志大小" type="number" min="1" max="64" step="1" value={value.maxMiB} onChange={e=>update({maxMiB:e.target.value})}/></label><label>最大行数（1—1,000,000）<input aria-label="最大行数" type="number" min="1" max="1000000" step="1" value={value.maxRecords} onChange={e=>update({maxRecords:e.target.value})}/></label><p className="hint">单行最多 8 MiB，JSON 深度 128，每维最多 10,000 组。文件上限不是浏览器内存上限；更大日志请使用 Native 工具。</p></details>
    <p className="hint">统计请求次数，不对 IP 去重。国家字段固定为 /country/iso_code，ASN 字段固定为 /autonomous_system_number。</p>
  </>;
}
type Dimension={counted:string;not_found:string;missing_field:string;type_error:string;query_error:string;group_count:string;other_requests:string;top:{key:string;count:string}[]};
type Report={requests:string;valid_ips:string;invalid_inputs:string;country:Dimension;asn:Dimension};
function DimensionView({title,value}:{title:string;value:Dimension}) {
  const total=BigInt(value.counted);
  return <section className="distribution"><h3>{title}</h3><p>{value.group_count} 个有效分组 · Top N 外 {value.other_requests} 次请求</p><table><thead><tr><th scope="col">分组</th><th scope="col">请求次数</th><th scope="col">成功计数占比</th></tr></thead><tbody>{value.top.map(row=><tr key={row.key}><th scope="row">{row.key===''?'（空字符串）':row.key}</th><td>{row.count}</td><td><progress aria-label={`${title} ${row.key} 的成功计数占比`} max={10000} value={total?Number(BigInt(row.count)*10000n/total):0}/></td></tr>)}</tbody></table>{!value.top.length?<p>没有可计入分组的请求。</p>:null}<dl className="analysis-counts">{([['counted','成功计数'],['not_found','IP 未命中'],['missing_field','字段缺失'],['type_error','字段类型错误'],['query_error','查询错误']] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{value[key]}</dd></div>)}</dl></section>;
}
export function AnalyticsResult({report}:{report:Report}) {
  return <div className="analytics-result"><dl className="analysis-totals">{[['输入请求',report.requests],['有效 IP',report.valid_ips],['无效输入',report.invalid_inputs]].map(([label,count])=><div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl><DimensionView title="国家分布" value={report.country}/><DimensionView title="ASN 分布" value={report.asn}/></div>;
}
