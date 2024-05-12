# topology-of-memory

run dev server for local testing
`npx vite`

expose local server for ip address
`npx vite --host`

build files
`npm run build`

# solutions to host

* update all links to include link from github repo
eg. all images need to use `https://kellymao.com/topology-of-memory/dist/daffodil.png`
* need to update `script.js`, `index.html`

1. no longer using vite to run dev build
* can't use inside of digial ocean `npx vite --host`
2. you can test using `npx vite` locally
3. once finished testing, run `npm run build` -- this generates /dist folder
4. copy contents of dist folder to public folder
5. double check all src or href files (.png, .glb, .geojson) inside of index.html includes correct links
* if you make any `script.js` or `styles.css` file changes, you need to upload to github and use the correct generated file names.
```
  <script type="module" src="https://kellymao.com/topology-of-memory/dist/assets/index-C4ioMmEr.js"></script>
  <link rel="stylesheet" href="https://kellymao.com/topology-of-memory/dist/assets/index-DtTFIB7k.css">
```
* if you want to have the updated `public/index.html` to include the new above links, push to github again after. you can have access to the backed up version at `https://kellymao.com/topology-of-memory/public/`

1. hosting on digital ocean
* copy changed files -- likely the `public/index.html` and `public/assets` to cyberduck inside the public folder

1. github pages
* set up a new repo that has only the files that are inside of the `/dist` folder
* go to settings -> pages -> post
* go to settings -> pages -> domain to update domain
    * likely will have to delete everything on your droplet and change some namecheap settings
