(()=>{const p=new URLSearchParams(location.search);const code=(p.get('code')||'').trim();if(code.length===6){location.replace(`/projection-v2/?code=${encodeURIComponent(code)}`)}})();
