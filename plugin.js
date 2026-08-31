/**
 * lampa-own-torrent
 * Paste magnet / .torrent for a TMDB card → history + TorrServer + player logos.
 */
(function () {
    'use strict'

    var VERSION = 22
    if (window.lampa_own_torrent_plugin === VERSION) return
    window.lampa_own_torrent_plugin = VERSION
    // legacy guard from local-media builds
    window.own_torrent_plugin = VERSION

    var HEAD = 'lot-head'
    var LABEL_OWN = 'Своя ссылка'

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

    function decodeUriPart(value) {
        try { return decodeURIComponent(String(value).replace(/\+/g, ' ')) } catch (e) {
            return String(value || '')
        }
    }

    function torrentTitleFromLink(link) {
        if (!link) return ''
        link = String(link)

        if (link.indexOf('magnet:') === 0) {
            var dn = link.match(/[?&]dn=([^&]+)/i)
            return dn ? decodeUriPart(dn[1]).trim() : ''
        }

        if (!/^https?:\/\//i.test(link)) return ''

        var file = decodeUriPart((link.split('?')[0].split('/').pop() || '')).replace(/\.torrent$/i, '').trim()
        if (!file || /^(download|dl|get|index|torrent|api)$/i.test(file)) return ''
        return file
    }

    var TITLE_STOP = /^(?:480p|576p|720p|1080[pi]|1440p|2160p|4320p|4k|8k|uhd|hdr10\+?|hdr|sdr|dv|dolby|vision|atmos|truehd|dts(?:hd)?|dd[p]?[257]|aac|ac3|eac3|e-ac3|opus|flac|bluray|blu-ray|bdremux|remux|bdrip|brrip|hddvd|hdrip|hdtvrip|hdtv|web-?dlrip|web-?dl|webrip|webdl|dvdrip|dvdscr|bdmv|imax|x264|x265|h264|h265|hevc|avc|xvid|divx|10bit|8bit|hi10p|pgs|srt|ass|m2ts|mkv|mp4|avi|mvo|dvo|avo|dub|dubbing|lostfilm|newstudio|amzn|nf|dsnp|atvp|rus|eng|ukr|ua)$/i

    function guessName(value) {
        var name = torrentTitleFromLink(value) || String(value || '')
        if (!name || name.indexOf('magnet:') === 0 || /^https?:\/\//i.test(name)) return ''

        name = decodeUriPart(name)
        name = name.replace(/www\./ig, '')
        name = name.replace(/\[[^\]]*\]/g, ' ')
        name = name.replace(/\{[^}]*\}/g, ' ')
        name = name.replace(/\.(torrent|mkv|mp4|avi|ts|m2ts|mov|wmv)$/i, '')
        name = name.replace(/[._+]+/g, ' ')
        name = name.replace(/\bS\d{1,2}(?:E\d{1,2})?\b.*$/i, ' ')
        name = name.replace(/\b(?:season|сезон)\s*\d+.*$/i, ' ')
        name = name.replace(/\b\d{1,2}\s*[xх]\s*\d{1,2}\b.*$/i, ' ')
        name = name.replace(/\b(?:h|x)\s*[26]64\b/ig, ' ')
        name = name.replace(/\bddp?\s*[257]\s*[. ]\s*[01]\b/ig, ' ')

        var parts = name.split(/[\s|]+/)
        var kept = []
        var i
        var token

        for (i = 0; i < parts.length; i++) {
            token = parts[i].replace(/[().,]+/g, '')
            if (!token) continue
            if (/^(19|20)\d{2}$/.test(token)) break
            if (/^\d{3,4}p$/i.test(token)) break
            if (TITLE_STOP.test(token) && kept.length) break
            if (/^[A-Z][A-Z0-9]+-[A-Z0-9]+$/i.test(token) && kept.length) break
            kept.push(token)
        }

        name = kept.join(' ').replace(/\s+/g, ' ').trim()
        name = name.replace(/\s+-\s+[A-Z0-9]{2,}$/i, '').trim()
        return name
    }

    function queryCandidates(raw) {
        var text = torrentTitleFromLink(raw) || String(raw || '')
        var seen = {}
        var out = []

        function add(value) {
            var cleaned = guessName(value)
            var key = cleaned.toLowerCase()
            if (!cleaned || seen[key]) return
            seen[key] = true
            out.push(cleaned)
        }

        String(text).split(/\s*\/\s*/).forEach(add)
        add(text)
        return out
    }

    function titleFromServerInfo(info) {
        if (!info) return ''

        var name = info.name || ''
        if (!name && info.file_stats && info.file_stats[0] && info.file_stats[0].path) {
            name = String(info.file_stats[0].path).split('/')[0]
        }

        name = String(name).replace(/^\[LAMPA\]\s*/i, '').trim()
        if (!name || /^torrent$/i.test(name)) return ''
        return name
    }

    function resolveTorrentTitle(link, done) {
        var fromLink = torrentTitleFromLink(link)
        if (fromLink) {
            done(fromLink)
            return
        }

        if (!Lampa.Torserver || !Lampa.Torserver.hash || !Lampa.Torserver.files) {
            done('')
            return
        }

        Lampa.Noty.show('Читаю название торрента…')

        Lampa.Torserver.hash({
            title: 'Torrent',
            poster: '',
            link: link
        }, function (json) {
            var hash = json && json.hash
            if (!hash) {
                done('')
                return
            }

            var tries = 0
            var finished = false
            var timer

            function tick() {
                tries++
                if (finished) return
                if (tries > 12) {
                    finished = true
                    clearInterval(timer)
                    done('')
                    return
                }

                Lampa.Torserver.files(hash, function (info) {
                    var name = titleFromServerInfo(info)
                    if (!name || finished) return
                    finished = true
                    clearInterval(timer)
                    done(name)
                })
            }

            tick()
            timer = setInterval(tick, 1000)
        }, function () {
            done('')
        })
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
            if (active.activity && isRealCard(active.activity.movie)) return active.activity.movie
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
                    if (!item || !item.id) return
                    if (!item.poster_path && !item.poster && !item.img) return
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
                    return (item.media_type === 'movie' || item.media_type === 'tv') && item.id &&
                        (item.poster_path || item.poster || item.img)
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
            }, function () {
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

            if (cards.length === 1) {
                restoreFocus()
                setTimeout(function () {
                    done(cards[0])
                }, 40)
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

    function launch(card, link, torrentName) {
        bindMovieToActivity(card)

        try { Lampa.Storage.set('torrserver_savedb', true) } catch (e) {}
        try { Lampa.Favorite.add('history', card, 100) } catch (e2) {}

        var title = torrentName || torrentTitleFromLink(link) || card.title || card.name

        // Pass full card (with images.logos) as 2nd arg — player MediaLoading reads it
        Lampa.Torrent.start({
            title: title,
            poster: posterOf(card),
            img: card.img || posterOf(card),
            card: card,
            MagnetUri: link.indexOf('magnet:') === 0 ? link : '',
            Link: link.indexOf('magnet:') === 0 ? '' : link
        }, card)
    }

    function bindAndLaunch(movie, link, torrentName) {
        enrichMovie(movie, function (card) {
            launch(card, link, torrentName)
        })
    }

    function searchCardAndLaunch(link, torrentName) {
        var queries = queryCandidates(torrentName).concat(queryCandidates(link))
        var seen = {}
        queries = queries.filter(function (item) {
            var key = item.toLowerCase()
            if (seen[key]) return false
            seen[key] = true
            return true
        })

        function askTitle(prefill) {
            askText('Название фильма / сериала', prefill || '', function (typed) {
                if (!typed) {
                    restoreFocus()
                    return
                }
                pickTmdbCard(typed, function (card) {
                    if (card) {
                        bindAndLaunch(card, link, torrentName)
                        return
                    }
                    Lampa.Noty.show('Карточка не найдена')
                })
            })
        }

        function tryQuery(index) {
            if (index >= queries.length) {
                Lampa.Noty.show('Не распознал фильм по названию торрента')
                askTitle(queries[0] || '')
                return
            }

            pickTmdbCard(queries[index], function (card) {
                if (card) {
                    bindAndLaunch(card, link, torrentName)
                    return
                }
                tryQuery(index + 1)
            })
        }

        if (queries.length) tryQuery(0)
        else askTitle('')
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

            var card = isRealCard(movie) ? movie : currentMovie()
            if (isRealCard(card)) {
                bindAndLaunch(card, link)
                return
            }

            resolveTorrentTitle(link, function (name) {
                searchCardAndLaunch(link, name)
            })
        })
    }

    function addOwnTorrentLink(movie) {
        movie = isRealCard(movie) ? movie : currentMovie()

        if (!Lampa.Torserver || !Lampa.Torserver.url()) {
            Lampa.Noty.show('Сначала укажи TorrServer в настройках')
            return
        }

        askNewLink(movie)
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
        var movie = movieFrom(active)
        addOwnTorrentLink(isRealCard(movie) ? movie : currentMovie())
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
        var movie = movieFrom(active)
        // Chain icon only on the Torrents page, not on an open media card
        var show = (active.component === 'mytorrents' || active.component === 'torrents') && !isRealCard(movie)
        $('.' + HEAD).toggleClass('hide', !show)
    }

    function dropLegacyLastButtons() {
        $('.lot-last-btn, .own-torrent-last-btn, .own-torrent-link-btn, .lot-own-btn').remove()
    }

    function injectAll() {
        dropLegacyLastButtons()
        syncHeadButton()
    }

    function startPlugin() {
        $('style.own-torrent-style, style.lot-style').remove()
        $('.own-torrent-head, .' + HEAD).remove()
        dropLegacyLastButtons()

        patchTorrentApi()
        ensureHeadButton()
        Lampa.Listener.follow('activity', function (e) {
            if (e.type === 'start' || e.type === 'archive') {
                setTimeout(injectAll, 80)
                setTimeout(injectAll, 400)
                setTimeout(injectAll, 1200)
            }
        })
        setInterval(injectAll, 1000)
    }

    if (window.appready) startPlugin()
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin()
        })
    }
})()
