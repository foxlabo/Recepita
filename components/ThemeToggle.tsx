'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';

export default function ThemeToggle(){
  const [dark, setDark] = useState(false);

  useEffect(()=>{
    const saved = localStorage.getItem('rx_theme');
    const isDark = saved ? saved === 'dark' : false;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  },[]);

  {/*function toggle(){
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('rx_theme', next ? 'dark':'light');
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle}>
     {/* {dark ? '🌙 ダーク' : '☀️ ライト'} 
    </Button>
  );*/}
}
