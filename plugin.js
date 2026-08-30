/**
 * lampa-own-torrent
 * Paste magnet / .torrent for a TMDB card → history + TorrServer + player logos.
 */
(function () {
    'use strict'

    var VERSION = 18
    if (window.lampa_own_torrent_plugin === VERSION) return
    window.lampa_own_torrent_plugin = VERSION
    // legacy guard from local-media builds
    window.own_torrent_plugin = VERSION

    var BTN = 'lot-own-btn'
    var BTN_LAST = 'lot-last-btn'
    var HEAD = 'lot-head'
    var STORE = 'own_torrent_links' // keep key — do not break saved magnets

    var LABEL_OWN = 'Своя ссылка'
    var LABEL_LAST = 'Последняя торрент ссылка'
    var LABEL_LAST_SHORT = 'Мой торрент'

    function as$(node) {
        if (!node) return $()
        if (node.jquery) return node
        return $(node)
    }

    function isRealCard(card) {
        var id = parseInt(card && card.id, 10)
        return !!(card && isFinite(id) && id > 0 && id < 1e12)
    }

    function normalizePosterPath(path) {
        if (!path) return ''
        path = String(path)
        // Already a relative TMDB path
        if (path.charAt(0) === '/') return path
        // Full URL → keep as-is for Api.img / direct use
        if (path.indexOf('http') === 0) return path
        // Broken local placeholder
        if (path.indexOf('./') === 0 || path.indexOf('img_broken') >= 0) return ''
        return path.charAt(0) === '/' ? path : '/' + path.replace(/^\/+/, '')
    }

    function posterOf(card) {
        if (!card) return ''

        var path = normalizePosterPath(card.poster_path)

        if (path && path.indexOf('http') !== 0) {
            try {
                if (Lampa.Api && Lampa.Api.img) return Lampa.Api.img(path, 'w300')
            } catch (e) {}
        }

        if (path.indexOf('http') === 0) return path

        var img = card.img || card.poster || ''
        if (img && String(img).indexOf('http') === 0) return img
        if (img && String(img).indexOf('img_broken') < 0 && String(img).indexOf('./') !== 0) {
            try {
                if (Lampa.Api && Lampa.Api.img && String(img).charAt(0) === '/') {
                    return Lampa.Api.img(img, 'w300')
                }
            } catch (e2) {}
        }

        return ''
    }

    function guessName(value) {
        var name = (value || '').replace(/\.[^.]+$/, '')
        var magnet = name.match(/[?&]dn=([^&]+)/i)

        if (magnet) {
            try { name = decodeURIComponent(magnet[1].replace(/\+/g, ' ')) } catch (e) {}
        }

        name = name.replace(/[._]/g, ' ')
        name = name.replace(/\b(1080p|720p|2160p|4k|uhd|bluray|blu-ray|webrip|web-dl|webdl|x264|x265|hevc|hdr|dts|aac|ac3|hdtv|proper|extended|remux|multi|rus|eng)(\b|.).*$/i, '')
        name = name.replace(/\bS\d{1,2}E\d{1,2}\b.*$/i, '')
        name = name.replace(/\(?((19|20)\d{2})\)?/, ' ')
        return name.replace(/\s+/g, ' ').trim()
    }

    function shortLink(link) {
        if (!link) return ''
        if (link.indexOf('magnet:') === 0) {
            var dn = guessName(link)
            return dn ? dn.slice(0, 42) : 'magnet…'
        }
        return link.length > 42 ? link.slice(0, 42) + '…' : link
    }

    function linksMap() {
        var map = Lampa.Storage.get(STORE, '{}')
        if (typeof map === 'string') {
            try { map = JSON.parse(map) } catch (e) { map = {} }
        }
        return map && typeof map === 'object' ? map : {}
    }

    function saveLink(card, link) {
        if (!isRealCard(card) || !link) return
        var map = linksMap()
        map[String(card.id)] = {
            link: link,
            title: card.title || card.name || '',
            time: Date.now()
        }
        Lampa.Storage.set(STORE, map)
    }

    function getSaved(card) {
        if (!isRealCard(card)) return null
        var item = linksMap()[String(card.id)]
        return item && item.link ? item : null
    }

    function langCode(value) {
        return String(value || '').toLowerCase().split(/[-_]/)[0]
    }

    /**
     * Player splash (MediaLoading) shows official title LOGO from TMDB images.logos.
     * Without it — plain text title. clearCard() strips images — keep them manually.
     */
    function pickLogo(images) {
        var logos = images && images.logos
        if (!Array.isArray(logos) || !logos.length) return null

        var preferred = langCode(Lampa.Storage.field('tmdb_lang') || 'ru')
        var order = [preferred, 'en', null]
        var i
        var logo

        for (i = 0; i < order.length; i++) {
            logo = logos.find(function (item) {
                if (!item || !item.file_path) return false
                if (order[i] === null) return !item.iso_639_1
                return langCode(item.iso_639_1) === order[i]
            })
            if (logo) return logo
        }

        return logos.find(function (item) { return item && item.file_path }) || null
    }

    function hasTitleLogo(card) {
        return !!(card && (
            card.logo ||
            (card.images && card.images.logos && card.images.logos.length)
        ))
    }

    function toCard(item) {
        var images = item && item.images
        var card = item

        if (Lampa.Utils && Lampa.Utils.clearCard) {
            try { card = Lampa.Utils.clearCard(item) } catch (e) { card = item }
        }

        // Keep relative poster_path so Lampa Card / history can load via proxy
        var path = normalizePosterPath(item.poster_path || card.poster_path)
        if (path && path.indexOf('http') !== 0) card.poster_path = path
        else if (path.indexOf('http') === 0) card.poster_path = card.poster_path || item.poster_path

        // clearCard drops images — restore for player MediaLoading logo
        if (images) card.images = images

        var poster = posterOf(card)
        // Мои торренты читают data.movie.poster
        card.poster = poster
        card.img = poster || card.img
        card.title = card.title || card.name
        card.source = card.source || item.source || 'tmdb'

        var logo = pickLogo(card.images)
        if (logo && logo.file_path && Lampa.Api && Lampa.Api.img) {
            try { card.logo = Lampa.Api.img(logo.file_path, 'w500') } catch (e2) {}
        }

        return card
    }

    function movieFrom(object) {
        if (!object) return null
        return object.movie || object.card || null
    }

    function currentMovie() {
        try {
            var active = Lampa.Activity.active() || {}
            var movie = movieFrom(active)
            if (isRealCard(movie)) return movie
        } catch (e) {}
        return null
    }

    function askText(title, value, done) {
        Lampa.Input.edit({
            title: title,
            value: value || '',
            free: true,
            nosave: true
        }, function (text) {
            done((text || '').trim())
        })
    }

    function restoreFocus() {
        setTimeout(function () {
            try {
                if (Lampa.Activity.active() && Lampa.Activity.active().activity) {
                    Lampa.Controller.toggle('content')
                    return
                }
            } catch (e) {}
            try { Lampa.Controller.toggle('menu') } catch (e2) {}
        }, 40)
    }

    function searchTmdbCards(query, done) {
        if (!query) return done([])

        function fromApiSearch(result) {
            var cards = []
            ;['movie', 'tv'].forEach(function (type) {
                var block = result && result[type]
                var list = (block && block.results) || []
                list.forEach(function (item) {
                    if (!item || !item.id || !item.poster_path) return
                    item.media_type = type
                    cards.push(toCard(item))
                })
            })
            return cards
        }

        function manual(doneManual) {
            var lang = Lampa.Storage.field('tmdb_lang') || 'ru'
            var key = (Lampa.TMDB && Lampa.TMDB.key) ? Lampa.TMDB.key() : ''
            var path = 'search/multi?query=' + encodeURIComponent(query) +
                '&page=1&include_adult=false&language=' + encodeURIComponent(lang) +
                (key ? '&api_key=' + key : '')

            var network = new Lampa.Reguest()
            network.timeout(10000)
            network.silent(Lampa.TMDB.api(path), function (json) {
                var cards = (json.results || []).filter(function (item) {
                    return (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path && item.id
                }).slice(0, 12).map(toCard)
                doneManual(cards)
            }, function () {
                doneManual([])
            })
        }

        if (Lampa.Api && Lampa.Api.search) {
            Lampa.Api.search({ query: query }, function (result) {
                var cards = fromApiSearch(result || {})
                if (cards.length) return done(cards)
                manual(done)
            })
            return
        }

        manual(done)
    }

    function pickTmdbCard(query, done) {
        Lampa.Noty.show('Ищу карточку…')
        searchTmdbCards(query, function (cards) {
            if (!cards.length) {
                restoreFocus()
                done(null)
                return
            }

            Lampa.Select.show({
                title: 'Выбери карточку',
                items: cards.map(function (card) {
                    var year = (card.release_date || card.first_air_date || '').slice(0, 4)
                    var serial = !!(card.name || card.media_type === 'tv')
                    return {
                        title: (card.title || card.name) + (year ? ' (' + year + ')' : ''),
                        subtitle: serial ? 'сериал' : 'фильм',
                        card: card
                    }
                }),
                onBack: function () {
                    restoreFocus()
                    done(null)
                },
                onSelect: function (choice) {
                    restoreFocus()
                    setTimeout(function () {
                        done(choice.card || null)
                    }, 40)
                }
            })
        })
    }

    function enrichMovie(movie, done) {
        // Prefer a fresh Api.full so images.logos are present.
        // Skip network only when logos are already on the object.
        if (hasTitleLogo(movie) && movie.backdrop_path && movie.images) {
            done(toCard(movie))
            return
        }

        if (!Lampa.Api || !Lampa.Api.full) {
            done(toCard(movie))
            return
        }

        Lampa.Api.full({
            id: movie.id,
            method: (movie.name || movie.first_air_date || movie.number_of_seasons) ? 'tv' : 'movie',
            card: movie,
            source: movie.source || 'tmdb'
        }, function (data) {
            done(toCard((data && data.movie) || movie))
        }, function () {
            done(toCard(movie))
        })
    }

    /**
     * Lampa.Torrent.show() uses: active.movie || SERVER.movie
     * On the Torrents tab active.movie is the OLD card without logos,
     * so it wins over our enriched SERVER.movie → plain text splash.
     * Push the enriched card into the current activity before start.
     */
    function bindMovieToActivity(card) {
        try {
            var active = Lampa.Activity.active()
            if (!active) return
            active.movie = card
            if (active.card) active.card = card
        } catch (e) {}
    }

    /**
     * Saved torrents (Мои торренты / повторный запуск) keep clearCard(movie)
     * without images.logos. Lampa then shows plain text on preload.
     * Wrap start/open so every launch gets a full TMDB card first.
     */
    function patchTorrentApi() {
        if (!Lampa.Torrent || Lampa.Torrent.__lot_logo_patch) return
        Lampa.Torrent.__lot_logo_patch = true

        var origStart = Lampa.Torrent.start
        var origOpen = Lampa.Torrent.open

        Lampa.Torrent.start = function (element, movie) {
            if (!isRealCard(movie)) {
                return origStart.call(Lampa.Torrent, element, movie)
            }

            enrichMovie(movie, function (card) {
                bindMovieToActivity(card)

                if (element && typeof element === 'object') {
                    element.card = card
                    element.poster = posterOf(card) || element.poster
                    element.img = card.img || element.img
                }

                origStart.call(Lampa.Torrent, element, card)
            })
        }

        Lampa.Torrent.open = function (hash, movie) {
            if (!isRealCard(movie)) {
                return origOpen.call(Lampa.Torrent, hash, movie)
            }

            enrichMovie(movie, function (card) {
                bindMovieToActivity(card)
                origOpen.call(Lampa.Torrent, hash, card)
            })
        }
    }

    function launch(card, link) {
        saveLink(card, link)
        bindMovieToActivity(card)

        try { Lampa.Storage.set('torrserver_savedb', true) } catch (e) {}
        try { Lampa.Favorite.add('history', card, 100) } catch (e2) {}

        // Pass full card (with images.logos) as 2nd arg — player MediaLoading reads it
        Lampa.Torrent.start({
            title: card.title || card.name,
            poster: posterOf(card),
            img: card.img || posterOf(card),
            card: card,
            MagnetUri: link.indexOf('magnet:') === 0 ? link : '',
            Link: link.indexOf('magnet:') === 0 ? '' : link
        }, card)
    }

    function launchSaved(movie) {
        var saved = getSaved(movie)
        if (!saved) {
            Lampa.Noty.show('Своей ссылки для этого фильма ещё нет')
            return
        }

        if (!Lampa.Torserver || !Lampa.Torserver.url()) {
            Lampa.Noty.show('Сначала укажи TorrServer в настройках')
            return
        }

        enrichMovie(movie, function (card) {
            launch(card, saved.link)
        })
    }

    function askNewLink(movie) {
        askText('Magnet или ссылка на .torrent', '', function (link) {
            if (!link) {
                restoreFocus()
                return
            }

            if (link.indexOf('magnet:') !== 0 && !/^https?:\/\//i.test(link)) {
                restoreFocus()
                Lampa.Noty.show('Нужен magnet: или http-ссылка на .torrent')
                return
            }

            if (isRealCard(movie)) {
                enrichMovie(movie, function (card) {
                    launch(card, link)
                })
                return
            }

            var suggested = guessName(link)

            setTimeout(function () {
                askText('Название фильма / сериала', suggested, function (query) {
                    if (!query) {
                        restoreFocus()
                        return
                    }

                    pickTmdbCard(query, function (card) {
                        if (!card) {
                            Lampa.Noty.show('Не найдено. Включи TMDB-прокси: https://cub.red/plugin/tmdb-proxy')
                            return
                        }
                        enrichMovie(card, function (full) {
                            launch(full, link)
                        })
                    })
                })
            }, 80)
        })
    }

    function addOwnTorrentLink(movie) {
        movie = isRealCard(movie) ? movie : currentMovie()

        if (!Lampa.Torserver || !Lampa.Torserver.url()) {
            Lampa.Noty.show('Сначала укажи TorrServer в настройках')
            return
        }

        var saved = getSaved(movie)

        // On a film that already has a saved link — offer last / new
        if (isRealCard(movie) && saved) {
            Lampa.Select.show({
                title: LABEL_OWN,
                items: [
                    {
                        title: LABEL_LAST,
                        subtitle: shortLink(saved.link),
                        use_last: true
                    },
                    {
                        title: 'Вставить новую',
                        subtitle: 'magnet или .torrent'
                    }
                ],
                onBack: restoreFocus,
                onSelect: function (choice) {
                    if (choice.use_last) {
                        restoreFocus()
                        setTimeout(function () {
                            launchSaved(movie)
                        }, 40)
                        return
                    }

                    setTimeout(function () {
                        askNewLink(movie)
                    }, 80)
                }
            })
            return
        }

        askNewLink(movie)
    }

    function activeRoot() {
        var root = $('.activity--active')
        if (root.length) return root

        try {
            var active = Lampa.Activity.active()
            if (active && active.activity) return as$(active.activity.render())
        } catch (e) {}

        return $()
    }

    function refreshContentNav() {
        try {
            if (Lampa.Controller.enabled().name !== 'content') return
            var active = Lampa.Activity.active()
            if (active && active.activity && active.activity.toggle) {
                active.activity.toggle()
            }
        } catch (e) {}
    }

    function headLinkSvg() {
        // Same language as native head icons: currentColor fill, 24 viewBox
        return (
            '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M3.9 12a5 5 0 015-5h3v2h-3a3 3 0 100 6h3v2h-3a5 5 0 01-5-5zm7.1-1h2v2h-2v-2zm2.1-4h3a5 5 0 010 10h-3v-2h3a3 3 0 100-6h-3V7z"/>' +
            '</svg>'
        )
    }

    function onHeadEnter() {
        var active = Lampa.Activity.active() || {}
        var movie = active.component === 'torrents' ? movieFrom(active) : currentMovie()
        addOwnTorrentLink(movie)
    }

    function ensureHeadButton() {
        if ($('.' + HEAD).length) return

        var icon

        // Clone a native head action so size/padding/focus match exactly
        var sample = $('.head__action.open--search, .head__actions .head__action').not('.open--profile').first()

        if (sample.length) {
            icon = $(sample[0].cloneNode(true))
            icon
                .removeClass('open--search open--notice open--settings open--fullscreen open--premium open--feed open--profile focus hover hide')
                .addClass(HEAD + ' hide')
                .attr('title', LABEL_OWN)
            icon.find('svg').replaceWith(headLinkSvg())
            icon.off('hover:enter hover:focus hover:hover hover:touch click')
            icon.on('hover:enter', onHeadEnter)

            if (Lampa.Head && Lampa.Head.addElement) Lampa.Head.addElement(icon)
            else $('.head__actions').prepend(icon)
            return
        }

        if (Lampa.Head && Lampa.Head.addIcon) {
            icon = Lampa.Head.addIcon(headLinkSvg(), onHeadEnter)
            icon.addClass(HEAD + ' hide').attr('title', LABEL_OWN)
            return
        }

        icon = $('<div class="head__action selector ' + HEAD + ' hide" title="' + LABEL_OWN + '">' + headLinkSvg() + '</div>')
        icon.on('hover:enter', onHeadEnter)
        $('.head__actions').prepend(icon)
    }

    function syncHeadButton() {
        ensureHeadButton()

        var active = Lampa.Activity.active() || {}
        var show = active.component === 'mytorrents' || active.component === 'torrents'
        $('.' + HEAD).toggleClass('hide', !show)
    }

    function injectTorrentsTab() {
        var active = Lampa.Activity.active() || {}
        if (active.component !== 'torrents') return

        var movie = movieFrom(active)
        var root = activeRoot()
        if (!root.length) return

        root.find('.explorer__files-head').removeClass('hide')

        if (root.find('.' + BTN).length) return

        var search = root.find('.filter--search').last()
        var button

        if (search.length) {
            button = search.clone(false)
            button.removeClass('filter--search focus').addClass(BTN)
            button.find('div').text(LABEL_OWN)
            if (!button.find('div').length) button.html('<div>' + LABEL_OWN + '</div>')
            button.off('hover:enter hover:focus hover:hover hover:touch')
            search.after(button)
        } else {
            var line = root.find('.torrent-filter').last()
            if (!line.length) return

            button = $(
                '<div class="simple-button selector ' + BTN + '">' +
                    '<div>' + LABEL_OWN + '</div>' +
                '</div>'
            )
            line.append(button)
        }

        button.on('hover:enter', function () {
            addOwnTorrentLink(movie)
        })

        // Short label in filter bar (full name on the movie card)
        if (isRealCard(movie) && getSaved(movie) && !root.find('.' + BTN_LAST).length) {
            var last = button.clone(false)
            last.removeClass(BTN + ' focus').addClass(BTN_LAST)
            last.find('div').text(LABEL_LAST_SHORT)
            if (!last.find('div').length) last.html('<div>' + LABEL_LAST_SHORT + '</div>')
            last.off('hover:enter hover:focus hover:hover hover:touch')
            last.on('hover:enter', function () {
                launchSaved(movie)
            })
            button.after(last)
        }

        setTimeout(refreshContentNav, 120)
    }

    function injectFullLastButton(e) {
        if (e.type !== 'complite' && e.type !== 'build') return
        if (e.type === 'build' && e.name && e.name !== 'start') return

        var movie = (e.data && e.data.movie) || movieFrom(e.object)
        if (!isRealCard(movie) || !getSaved(movie)) return

        var root = e.body && e.body.length ? e.body : $()
        if (!root.length && e.link && e.link.html) root = as$(e.link.html)
        if (!root.length) root = activeRoot()
        if (!root.length) return

        // Drop leftover buttons from older builds
        root.find('.' + BTN + ', .own-torrent-link-btn').remove()

        if (root.find('.' + BTN_LAST + ', .own-torrent-last-btn').length) return

        var torrent = root.find('.view--torrent').not('.' + BTN_LAST).first()
        var wrap = torrent.parent()
        if (!wrap.length) wrap = root.find('.full-start-new__buttons, .full-start__buttons').first()
        if (!wrap.length) return

        var lastBtn

        if (torrent.length) {
            // Clone Torrents button → same icon + style, only label changes
            lastBtn = torrent.clone(false)
            lastBtn.removeClass('view--torrent focus ' + BTN).addClass(BTN_LAST)
            lastBtn.off('hover:enter hover:focus hover:hover hover:touch')
            if (lastBtn.find('span').length) {
                lastBtn.find('span').text(LABEL_LAST)
            } else {
                lastBtn.append('<span>' + LABEL_LAST + '</span>')
            }
        } else {
            lastBtn = $(
                '<div class="full-start__button selector ' + BTN_LAST + '">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M3.9 12a5 5 0 015-5h3v2h-3a3 3 0 100 6h3v2h-3a5 5 0 01-5-5zm7.1-1h2v2h-2v-2zm2.1-4h3a5 5 0 010 10h-3v-2h3a3 3 0 100-6h-3V7z"/>' +
                    '</svg>' +
                    '<span>' + LABEL_LAST + '</span>' +
                '</div>'
            )
        }

        lastBtn.on('hover:enter', function () {
            launchSaved(movie)
        })

        if (torrent.length) torrent.after(lastBtn)
        else wrap.append(lastBtn)
    }

    function injectAll() {
        syncHeadButton()
        injectTorrentsTab()
    }

    function startPlugin() {
        $('style.own-torrent-style, style.lot-style').remove()
        $('.own-torrent-head, .' + HEAD).remove()

        patchTorrentApi()
        ensureHeadButton()
        Lampa.Listener.follow('full', injectFullLastButton)
        Lampa.Listener.follow('activity', function (e) {
            if (e.type === 'start' || e.type === 'archive') {
                setTimeout(injectAll, 80)
                setTimeout(injectAll, 400)
                setTimeout(injectAll, 1200)
            }
        })
        // Filter bar mounts late after parser response
        setInterval(injectAll, 1000)
    }

    if (window.appready) startPlugin()
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin()
        })
    }
})()
