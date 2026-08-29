/*
 * sticky-atc-mobile.js
 *
 * Mobile behaviour (<=991px) for the product sticky Add to Bag / Buy Now bar.
 *
 * global.js toggles the same bar from `scrollTop > window.height` - a proxy that
 * only lines up with the desktop layout. On a phone the gallery is taller and
 * the real buttons sit far lower, so that rule reveals the bar while the shopper
 * can still see and tap the buttons. Below 992px we drive visibility from an
 * IntersectionObserver on the main form's button block instead.
 *
 * FAIL-OPEN CONTRACT: the stylesheet only suppresses global.js's coarse `.act`
 * trigger while the bar carries `js-sticky-controlled`, which is added below
 * once every lookup this script needs has succeeded. If the script 404s, throws,
 * or bails, that class is never added and the bar keeps working off `.act` -
 * degraded but visible. Never neutralise `.act` unconditionally in CSS: that
 * makes any JS failure a bar that can never appear on mobile at all.
 *
 * The bar also renders stale data that never updates, because
 * ProductVariantSelectsStick in nov-product-variants.js looks up
 * `#product-form-sticky-${this.dataset.productId}` while the markup only sets
 * data-section - so it resolves to undefined and silently does nothing. On
 * desktop that is cosmetic; on mobile this bar becomes the primary buy path, so
 * we mirror the variant id, price and button state from the main form here.
 */
(function () {
  'use strict';

  var TAG = '[sticky-atc-mobile]';
  var MOBILE_MAX = 991;

  function bail(reason) {
    if (window.console && console.warn) {
      console.warn(TAG + ' inactive: ' + reason + '. Falling back to global.js.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lookups - every failure here is reported, never silent              */
  /* ------------------------------------------------------------------ */

  var bar = document.querySelector('.product-single__stick-add');
  if (!bar) {
    bail('no .product-single__stick-add in the page');
    return;
  }

  var mainFormId = bar.getAttribute('data-main-form');
  if (!mainFormId) {
    bail('the bar has no data-main-form attribute - snippets/product-single-sticky-add.liquid is not the updated version');
    return;
  }

  var mainForm = document.getElementById(mainFormId);
  if (!mainForm) {
    bail('no form with id "' + mainFormId + '"');
    return;
  }

  var trigger = mainForm.querySelector('.product-form__item--submit');
  if (!trigger) {
    bail('no .product-form__item--submit inside #' + mainFormId);
    return;
  }

  var mainIdInput = mainForm.querySelector('[name="id"]');
  var hasIO = 'IntersectionObserver' in window;
  var observer = null;

  function isMobile() {
    return window.innerWidth <= MOBILE_MAX;
  }

  /* ------------------------------------------------------------------ */
  /* Visibility                                                          */
  /* ------------------------------------------------------------------ */

  // Padding is applied only while the bar is on screen. The bar is
  // position:fixed, so reserving the space permanently would leave a dead gap
  // at the bottom of every product page.
  var originalPadding = document.body.style.paddingBottom;
  var padded = false;

  // The mobile bottom nav is position:fixed at bottom:0 with z-index 101 and an
  // opaque background, so a bar at bottom:0 renders completely behind it. Below
  // 768px the product stylesheet hides the nav, which makes this measure 0 and
  // the bar sit flush. Kept as a measurement rather than a hardcoded 0 so the
  // bar stacks above the nav automatically if it is ever restored here.
  var mobileNav = document.getElementById('stickymenu_bottom_mobile');

  function navHeight() {
    // offsetParent is null while display:none has it out of the layout.
    return (mobileNav && mobileNav.offsetParent !== null) ? mobileNav.offsetHeight : 0;
  }

  function applyOffset() {
    document.documentElement.style.setProperty('--sticky-atc-offset', navHeight() + 'px');
  }

  function show() {
    applyOffset();
    bar.classList.add('act-mobile');
    // Reserve the bar AND anything below it, otherwise the last of the page
    // stays trapped behind them.
    document.body.style.paddingBottom = (bar.offsetHeight + navHeight()) + 'px';
    padded = true;
  }

  function hide() {
    bar.classList.remove('act-mobile');
    if (padded) {
      document.body.style.paddingBottom = originalPadding;
      padded = false;
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) hide();
        else show();
      });
    }, { threshold: 0 });
    observer.observe(trigger);
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    hide();
  }

  // Used only where IntersectionObserver is unavailable.
  function scrollFallback() {
    if (!isMobile()) return;
    var rect = trigger.getBoundingClientRect();
    var viewport = window.innerHeight || document.documentElement.clientHeight;
    if (rect.bottom < 0 || rect.top > viewport) show();
    else hide();
  }

  function syncMode() {
    if (!isMobile()) {
      stopObserver();
      return;
    }
    if (hasIO) startObserver();
    else scrollFallback();
  }

  /* ------------------------------------------------------------------ */
  /* Keeping the bar honest                                              */
  /* ------------------------------------------------------------------ */

  var stickyPrice = bar.querySelector('[id^="ProductPriceStick-"]');
  var mainPrice = stickyPrice
    ? document.getElementById(stickyPrice.id.replace('ProductPriceStick-', 'ProductPrice-'))
    : null;
  var stickyAddBtn = bar.querySelector('.btnAddToCart');
  var mainAddBtn = mainForm.querySelector('.btnAddToCart');

  // The bar holds two hidden name="id" inputs: its own form's, and the one
  // inside the {% form 'product' %} that renders the dynamic checkout button.
  // Both are frozen at render time, so Buy Now would check out the default
  // variant regardless of what the shopper picked. Mirror the main form's value
  // rather than replacing the payment button, which would lose express wallets.
  function syncVariantId() {
    if (!mainIdInput || !mainIdInput.value) return;
    Array.prototype.forEach.call(bar.querySelectorAll('[name="id"]'), function (input) {
      if (input.value !== mainIdInput.value) input.value = mainIdInput.value;
    });
  }

  // The main price block is re-rendered asynchronously (renderProductInfo fetches
  // a section), so mirror it with a MutationObserver. Reading it on the change
  // event would copy the previous variant's price, because the fetch has not
  // landed yet.
  function syncPrice() {
    if (!stickyPrice || !mainPrice) return;
    stickyPrice.innerHTML = mainPrice.innerHTML;
    var badge = stickyPrice.querySelector('.product-price__badge');
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
  }

  // toggleAddButton only ever targets the main form, so the sticky button would
  // still read "Add to bag" for a sold-out variant and 422 on tap.
  function syncAddButton() {
    if (!stickyAddBtn || !mainAddBtn) return;
    var mainLabel = mainAddBtn.querySelector('[id="AddToCartText"]');
    var stickyLabel = stickyAddBtn.querySelector('[id="AddToCartText"]');
    if (mainLabel && stickyLabel && stickyLabel.innerText !== mainLabel.innerText) {
      stickyLabel.innerText = mainLabel.innerText;
    }
    if (mainAddBtn.hasAttribute('disabled')) {
      stickyAddBtn.setAttribute('disabled', 'disabled');
    } else {
      stickyAddBtn.removeAttribute('disabled');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  if (mainIdInput) {
    // updateVariantInput() sets .value and dispatches a bubbling change event.
    mainIdInput.addEventListener('change', function () {
      syncVariantId();
      syncAddButton();
    });
  }

  if (mainPrice && 'MutationObserver' in window) {
    new MutationObserver(syncPrice).observe(mainPrice, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (!hasIO) {
    window.addEventListener('scroll', scrollFallback, { passive: true });
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      syncMode();
      if (padded) show();
    }, 150);
  });

  // Everything resolved: take over from global.js on mobile. Until this line
  // runs, the stylesheet leaves `.act` alone and the bar degrades gracefully.
  bar.classList.add('js-sticky-controlled');

  applyOffset();
  syncVariantId();
  syncMode();

  if (window.console && console.info) {
    console.info(TAG + ' active - main form #' + mainFormId + ', IntersectionObserver: ' + hasIO);
  }
})();
