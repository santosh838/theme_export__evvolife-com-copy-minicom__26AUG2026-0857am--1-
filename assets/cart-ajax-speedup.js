/*
 * cart-ajax-speedup.js
 *
 * Speeds up the ajax mini-cart. nuranium.js chains 3-4 network round trips after
 * every add / remove / quantity change, and waits a hard-coded 1000ms before it
 * opens the drawer. Both /cart/add.js and /cart/change.js already return the full
 * cart object, so most of those follow-up requests are re-fetching data we hold.
 *
 * MUST be loaded with `defer` AFTER nuranium.js: deferred scripts execute in
 * document order, so our $(document).ready() handler is registered second and
 * therefore runs after nuranium's, which is what lets us .off() its bindings.
 */
(function ($) {
  if (!$) return;

  function money(cents) {
    if (typeof Shopify !== 'undefined' && Shopify.formatMoney && typeof theme !== 'undefined') {
      return Shopify.formatMoney(cents, theme.moneyFormat);
    }
    return cents;
  }

  // Paint from a cart object we already have, instead of another GET /cart.js.
  function paintTotals(cart) {
    if (!cart) return;
    $('.CartCount, #CartCountCavas').text(cart.item_count);
    $('#header-cart-total').html(money(cart.total_price));
    $('#cart-info').find('.subtotal span').html(money(cart.total_price));
    $('.cart-popup-heading span').html('There are ' + cart.item_count + ' item(s) in your cart');
    $('#desktop_cart').toggleClass('item_count', cart.item_count > 0);
  }

  function openDrawer() {
    $('#desktop_cart').addClass('active');
    $('.sidebar-overlay').addClass('act');
    $('body').addClass('cart_popup_opened');
  }

  // One request for the markup. Totals come from the cart object we were handed.
  function refresh(cart) {
    return $.get('/cart?view=json', function (html) {
      $('#cart-info').html(html);
    }).always(function () {
      paintTotals(cart); // re-apply: swapping the markup replaced those nodes
    });
  }

  function change(id, qty, $row) {
    if ($row) $row.css('opacity', 0.4); // instant feedback while the request runs
    return $.ajax({
      type: 'POST',
      url: '/cart/change.js',
      data: { quantity: qty, id: id },
      dataType: 'json'
    }).done(function (cart) {
      if ($('body').hasClass('template-cart')) {
        window.location.reload();
        return;
      }
      refresh(cart);
    }).fail(function () {
      if ($row) $row.css('opacity', 1);
    });
  }

  $(document).ready(function () {

    // 1. Open the drawer the moment /cart/add.js answers. nuranium waits on
    //    setTimeout(..., 1000) for this; addClass is idempotent so that later
    //    timeout becomes a no-op rather than a conflict.
    $(document).ajaxComplete(function (event, xhr, settings) {
      if (!settings || !settings.url) return;
      if (settings.url.indexOf('/cart/add.js') === -1) return;
      if (typeof theme === 'undefined' || theme.cart_status !== 'show_minicart') return;
      if (xhr && xhr.status >= 400) return;
      openDrawer();
    });

    // 2. Remove. nuranium called initMiniCart(), which blanks #cart-info (visible
    //    flash), then does GET /cart?view=extend + GET /cart.js and rebuilds the
    //    whole drawer via string concatenation. One view=json render replaces all
    //    of that.
    $('#cart-info').off('click', '.remove-from-cart');
    $('#cart-info').on('click', '.remove-from-cart', function (e) {
      e.preventDefault();
      var $btn = $(this);
      change($btn.attr('data-product-id'), 0, $btn.closest('.ajaxcart__product'));
    });

    // 3. Quantity +/-. nuranium fired change.js + view=up_ajax + view=json +
    //    cart.js, and view=json overwrote the subtotal view=up_ajax had just
    //    written - a race that could leave a stale total on screen.
    $(document).off('click', '.cart__mini-qty');
    $(document).on('click', '.cart__mini-qty', function (e) {
      e.preventDefault();
      var $btn = $(this),
          $input = $btn.siblings('.cart__mini-qty--input'),
          id = $input.attr('data-id'),
          current = parseFloat($input.val()),
          step = parseFloat($input.attr('step')) || 1,
          min = parseFloat($input.attr('min')) || 1,
          max = parseFloat($input.attr('max')),
          next;

      if (isNaN(current)) return;

      if ($btn.hasClass('cart__mini-qty--plus')) {
        next = current + step;
        if (max > 0 && next > max) {
          $input.val(max);
          return;
        }
      } else {
        next = current - step;
        if (next <= 0) {
          $btn.closest('.ajaxcart__product').find('.remove-from-cart').trigger('click');
          return;
        }
        if (next < min) return;
      }

      $input.val(next); // optimistic: the number moves immediately
      change(id, next, $btn.closest('.ajaxcart__product'));
    });

    // Typing a quantity directly. nuranium's version read min/max through a comma
    // operator and then called .val() on a Number, throwing a TypeError whenever
    // the typed value exceeded max.
    $(document).off('change', '.cart__mini-qty--input');
    $(document).on('change', '.cart__mini-qty--input', function () {
      var $input = $(this),
          value = parseFloat($input.val()),
          id = $input.attr('data-id'),
          max = parseFloat($input.attr('max'));

      if (isNaN(value)) return;

      if (max > 0 && value > max) {
        value = max;
        $input.val(max);
      }
      if (value <= 0) {
        $input.closest('.ajaxcart__product').find('.remove-from-cart').trigger('click');
        return;
      }
      change(id, value, $input.closest('.ajaxcart__product'));
    });
  });
})(window.jQuery);
