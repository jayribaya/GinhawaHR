import React,{useEffect,useState} from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter,Routes,Route,Navigate,Outlet} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {api,refresh,useSession,type Actor} from './services/api';
import {Shell} from './layouts/Shell';
import {Login,Recovery} from './pages/Login';
import {Dashboard} from './pages/Dashboard';
import {ResourcePage,State} from './pages/Resources';
import {EmployeeProfile} from './pages/Employee';
import {Attendance} from './pages/Attendance';
import {Payroll,PayrollDetail} from './pages/Payroll';
import {Payslips,Payments,Reports,Notifications} from './pages/Workflows';
import {Account} from './pages/Account';
import './styles.css';
const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30000,gcTime:60000,refetchOnWindowFocus:false}}});
function Protected(){const actor=useSession(s=>s.actor);const [loading,setLoading]=useState(!actor);useEffect(()=>{if(actor)return;let active=true;void refresh().then(async token=>{const me=await api<Actor>('/auth/me');if(active)useSession.getState().set(token,me.data);}).catch(()=>{if(active)useSession.getState().set(null);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[actor]);if(loading&&!actor)return <div className="boot"><div className="brand">Ginhawa<span>HR</span></div><State loading/></div>;return actor?<Outlet/>:<Navigate to="/login" replace/>;}
function App(){return <BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route path="/recovery" element={<Recovery/>}/><Route element={<Protected/>}><Route element={<Shell/>}><Route index element={<Dashboard/>}/><Route path="employees" element={<ResourcePage resource="employees"/>}/><Route path="employees/:id" element={<EmployeeProfile/>}/><Route path="attendance" element={<Attendance/>}/><Route path="payroll" element={<Payroll/>}/><Route path="payroll/:id" element={<PayrollDetail/>}/><Route path="payslips" element={<Payslips/>}/><Route path="payments" element={<Payments/>}/><Route path="reports" element={<Reports/>}/><Route path="notifications" element={<Notifications/>}/><Route path="account" element={<Account/>}/><Route path=":resource" element={<ResourcePage/>}/><Route path="*" element={<State error={new Error('Page not found')}/>}/></Route></Route></Routes></BrowserRouter>;}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><App/></QueryClientProvider></React.StrictMode>);
