const API_BASE = 'https://www.reddit.com/'

const md = window.markdownit()

const app = new Vue({
	el: '#app',
	data: {
		dark_theme: false,
		current_subreddit: 'nosurf',
		current_page: 1,
		sorting_method: 'hot',
		reading_post: false,
		has_next: true,
		has_previous: false,
		post_list: [ 
			/*{
				id: null,
				title: 'hey',
				author: '[deleted]',
				content: 'sup',
				score: 10,
				comments: 0
			}*/
		],
		curr_post: {
			id: '',
			subreddit: '',
			title: '',
			author: '[deleted]',
			content: '',
			parsed_content: '',
			score: 125,
			comments: 120
		}
	},
	methods: {
		/**
		 * Vai para a próxima ou anterior página.
		 * @param {1|-1} mul +1 => vai para a próxima, -1 => vai para a anterior
		 */
		switchPages: async function(mul) {
			if(mul > 0) {
				this.current_page += 1
				this.fetchPosts({ beforeOrAfter: 'after', id: this.post_list[this.post_list.length-1]?.id })
			} else {
				this.current_page -= 1
				if(this.current_page < 1) {
					this.current_page = 1
					return
				}
				this.fetchPosts({ beforeOrAfter: 'before', id: this.post_list[0]?.id })
			}
		},
		/**
		 * Muda a subreddit atual.
		 * @param {string} subreddit nome da subreddit 
		 */
		switchSubreddits: async function(subreddit) {
			let s = subreddit ? subreddit : (prompt('Subreddit name...') || 'all')
			s = s.replace('r/', '')

			this.current_subreddit = s
			this.current_page = 1
			this.fetchPosts()

			history.pushState({ state: 'viewing_subreddit', subreddit }, '', `#/r/${s}/`)
		},
		/**
		 * Muda o sorting atual
		 * @param {'top'|'hot'|'new'|'controversial'} s_method método de sorting
		 */
		switchSorting: async function(s_method) {
			let possible_methods = ['top', 'hot', 'new']
			let prompt_msg = possible_methods.map((name, ind) => `${ind+1}	${name}`).join('\n')
			let i = possible_methods.findIndex(v => v === s_method)+1 || parseInt(prompt(prompt_msg))

			if(!possible_methods[i-1])
				return false
			
			this.sorting_method = possible_methods[i-1]
			this.current_page = 1
			this.fetchPosts()
		},
		/**
		 * Abre um post no Post Reader.
		 * @param {*} post 
		 */
		openPost: async function(post) {
			this.curr_post.id = post.id
			this.curr_post.subreddit = post.subreddit
			this.curr_post.title = post.title
			this.curr_post.author = post.author
			this.curr_post.content = post.content
			this.curr_post.parsed_content = md.render(post.content)
			this.curr_post.score = post.score
			this.curr_post.comments = []

			this.reading_post = true

			history.pushState({ state: 'viewing_post', post_id: post.id, subreddit: post.subreddit }, '', `#/r/${post.subreddit}/comments/${post.id}`)

			let { comments } = await this.fetchPost(this.current_subreddit, post.id)
			this.curr_post.comments = comments
		},
		closePost: async function() {
			this.reading_post = false
			this.current_subreddit = this.curr_post.subreddit
			history.pushState({ state: 'viewing_subreddit', subreddit: this.current_subreddit }, '', `#/r/${this.current_subreddit}/`)
			
			if(!this.post_list.length) {
				this.fetchPosts()
			}
		},
		/**
		 * Retorna uma lista de posts da subreddit levado em conta o sorting e o post anterior.
		 * @param {*} opts 
		 */
		fetchPosts: async function(opts = { beforeOrAfter:'none',id:null }) {
			let last_post_before_refresh = this.post_list[this.post_list.length - 1]

			// limpar os posts
			this.post_list = []

			// req HTTP para a API
			let resp = await fetch(`${API_BASE}r/${this.current_subreddit}/${this.sorting_method}/.json?limit=48&${opts.beforeOrAfter}=t3_${opts.id}`)
						.then(r => r.json())

			console.log(resp)

			// converter cada post da API para o 'meu' formato
			this.post_list = resp.data.children.slice(0, 48).map(p => {
				return {
					id: p.data.id,
					subreddit: p.data.subreddit,
					title: p.data.title,
					author: p.data.author,
					content: p.data.selftext,
					score: p.data.ups,
					comments: p.data.num_comments,
				}
			})

			this.has_next = !!resp.data.after
			this.has_previous = !!last_post_before_refresh

			// scroll ao topo da lista
			document.body.scrollTo(0, 0)
		},
		/** 
		 * Retorna um post e seus comentários.
		 * @param {string} subreddit subreddit que hospeda o post
		 * @param {string} id ID36 do post em questão.
		 */
		fetchPost: async function(subreddit, id) {
			subreddit = subreddit.replace('r/', '')

			console.log(`Pegando post ${id} da subreddit ${subreddit}...`)

			let resp = await fetch(`${API_BASE}r/${subreddit}/comments/${id}/.json?depth=1`)
						.then(r => r.json())

			console.log(`Pegando post ${id} da subreddit ${subreddit}... ok`)
			console.log(resp)

			let p = resp[0].data.children[0]
			let comments = resp[1].data.children.map(ac => {
				return {
					id: ac.data.id,
					author: ac.data.author,
					is_op: ac.data.is_submitter,
					content: ac.data.body,
					content_parsed: md.render(ac.data.body),
					score: ac.data.ups
				}
			})

			return {
				id: p.data.id,
				subreddit: p.data.subreddit,
				title: p.data.title,
				author: p.data.author,
				content: p.data.selftext,
				score: p.data.ups,
				comments: comments
			}
		}
	}
})

/**
 * Decompõe a URL e carrega o estado do app a partir dela.
 */
let loadStateFromURL = async () => {
	let paths = location.hash.split('/').slice(1)

	// /r/subreddit ?
	if(paths[0] === 'r' && paths[1]) {
		let subreddit = decodeURIComponent(paths[1])
		// /comments/post_id ?
		if(paths[2] === 'comments' && paths[3]) {
			let post_id = decodeURIComponent(paths[3])

			app.current_subreddit = subreddit
			app.fetchPosts()
			app.openPost(await app.fetchPost(subreddit, post_id))

			return
		}

		// carregar lista de posts da subreddit
		app.current_subreddit = subreddit
		app.reading_post = false
		app.fetchPosts()
		return
	}

	// nenhuma subreddit na URL. carregar r/all
	app.current_subreddit = 'all'
	app.reading_post = false
	app.fetchPosts()
}

loadStateFromURL()

// executado quando o usuário manualmente altera a hash da URL
window.addEventListener('hashchange', e => {
	console.log(`Mudança de hash: `, e)
	loadStateFromURL()
})