import { html, setHTML, icon } from '../ui.js';
import { S } from '../store.js';
import { telLink } from '../components.js';

export default async function notFound(ctx) {
  ctx.meta('Page not found', 'The page you were looking for could not be found.');
  setHTML(ctx.el, html`
  <section class="notfound a-nf" aria-labelledby="nf-h">
    <div class="container a-nf-in">
      <div class="a-nf-cube" aria-hidden="true"><span>4</span><span>0</span><span>4</span></div>
      <h1 id="nf-h">This page has left the venue</h1>
      <p class="lead">The link may be old or mistyped. Let us help you find your way back.</p>
      <div class="row" style="justify-content:center;margin-top:22px">
        <a class="btn gold lg" href="/">${icon('layout')} Back to home</a>
        <a class="btn glass lg" href="/halls">Explore halls</a>
        <a class="btn glass lg" href="/contact">Contact us</a>
        ${S.site?.phone ? html`<a class="btn glass lg" href="${telLink()}">${icon('phone')} ${S.site.phone}</a>` : ''}
      </div>
    </div>
  </section>`);
}
