const {buildSync}=require('esbuild');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
buildSync({absWorkingDir:root,entryPoints:['todo-native/app.jsx'],bundle:true,minify:true,target:['es2020'],define:{'process.env.NODE_ENV':'"production"'},outfile:'todo-native/app.js',legalComments:'linked'});
execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-c','todo-native/tailwind.config.cjs','-i','todo-native/styles.css','-o','todo-native/app.css','--minify'],{cwd:root,stdio:'inherit'});
