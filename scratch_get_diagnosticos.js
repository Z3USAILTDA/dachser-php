async function run() {
  try {
    const res = await fetch('https://dachser.z3us.my/api/chb/diagnosticos?t=' + Date.now());
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error fetching diagnostics:', err);
  }
}
run();
