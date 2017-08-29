import Axios from 'axios'
import Vue from 'vue'

const axiosPlugin = {
  install() {
    if(Vue.__nuxt_axios_installed__) {
      return
    }
    Vue.__nuxt_axios_installed__ = true

    if (!Vue.prototype.hasOwnProperty('$axios')) {
      Object.defineProperty(Vue.prototype, '$axios', {
        get () {
          return this.$root.$options.$axios
        }
      })
    }
  }
}

Vue.use(axiosPlugin)

// We cannot extend Axios.prototype
const axiosExtraProto = {}

// Sets a common header
axiosExtraProto.setHeader = function setHeader (name, value, scopes = 'common') {
  if(!Array.isArray(scopes)) {
    scopes = [scopes]
  }
  scopes.forEach(scope => {
    if (!value) {
      delete this.defaults.headers[scope][name];
      return
    }
    this.defaults.headers[scope][name] = value
  })
}

// Set requests token
axiosExtraProto.setToken = function setToken (token, type, scopes = 'common') {
    const value = !token ? null : (type ? type + ' ' : '') + token
    this.setHeader('Authorization', value, scopes)
}

// Request helpers
const reqMethods = [
    'request', 'delete', 'get', 'head', 'options', // url, config
    'post', 'put', 'patch' // url, data, config
]
reqMethods.forEach(method => {
  axiosExtraProto['$' + method] = function () {
    return this[method].apply(this, arguments).then(res => res.data)
  }
})

// Setup all helpers to axios instance (Axios.prototype cannot be modified)
function setupHelpers( axios ) {
  for (let key in axiosExtraProto) {
    axios[key] = axiosExtraProto[key].bind(axios)
  }
}

const redirectError = <%= serialize(options.redirectError) %>

// Set appreciate `statusCode` and `message` to error instance
function errorHandler(error) {
  if (error.response) {
    // Error from backend (non 2xx status code)
    // ...Auto redirect on special status codes
    if (redirectError[error.response.status]) {
      this.redirect(redirectError[error.response.status])
    }
    error.statusCode = error.statusCode || parseInt(error.response.status) || 500
    error.message = error.message || error.response.statusText || (error.statusCode + ' (Internal Server Error)')
  } else if (error.request) {
    // Error while making request
    error.statusCode = error.statusCode || 500
    error.message = error.message || 'request error'
  } else {
    // Something happened in setting up the request that triggered an Error
    error.statusCode = 500
    error.message = error.message || 'axios error'
  }

  return Promise.reject(error)
}

<% if(options.debug) { %>
function debug(level, messages) {
  if (!(console[level] instanceof Function)) {
    level = 'info'
    messages = arguments
  } else {
    level = arguments[0]
    messages = Array.prototype.slice.call(arguments, 1)
  }

  if (!messages.length) {
    console[level].call(null, '[@nuxtjs/axios] <empty debug message>')
  } else {
    for (var i = 0; i < messages.length; i++) {
      console[level].call(null, messages[i])
    }
  }
}
<% } %>

/* Setup BaseURL
const baseURL = process.browser
  ? (process.env.API_URL_BROWSER || '<%= options.browserBaseURL %>')
  : (process.env.API_URL || '<%= options.baseURL %>')
  */

// Setup BaseURL- Remove process for electron
const baseURL = process.browser
  ? ('<%= options.browserBaseURL %>')
  : ('<%= options.baseURL %>')

export default (ctx) => {
  const { app, store, req } = ctx

  // Create a fresh objects for all default header scopes
  // Axios creates only one which is shared across SSR requests!
  // https://github.com/mzabriskie/axios/blob/master/lib/defaults.js
  const headers = {
    common : {
      'Accept': 'application/json, text/plain, */*'
    },
    delete: {},
    get: {},
    head: {},
    post: {},
    put: {},
    patch: {}
  }

  <% if(options.proxyHeaders) { %>
  // Default headers
  headers.common = (req && req.headers) ? Object.assign({}, req.headers) : {}
  delete headers.common.host
  <% } %>

  // Create new axios instance
  const axios = Axios.create({
    baseURL,
    headers
  })

  <% if(options.credentials) { %>
  // Send credentials only to relative and API Backend requests
  axios.interceptors.request.use(config => {
    if (config.withCredentials === undefined) {
      if (!/^https?:\/\//i.test(config.url) || config.url.indexOf(baseURL) === 0) {
        config.withCredentials = true
      }
    }
    return config
  });
  <% } %>

  <% if(options.debug) { %>
  // Debug
  axios.interceptors.request.use(config => {
    debug('[@nuxtjs/axios] Request:', config)
    return config
  }, error => {
    debug('error', '[@nuxtjs/axios] Error:', error)
    return Promise.reject(error)
  });
  axios.interceptors.response.use(config => {
    debug('[@nuxtjs/axios] Response:', config)
    return config
  }, error => {
    debug('error', '[@nuxtjs/axios] Error:', error)
    return Promise.reject(error)
  });
  <% } %>

  <% if (options.requestInterceptor) { %>
  // Custom request interceptor
    const reqInter = <%= serialize(options.requestInterceptor).replace('requestInterceptor(', 'function(').replace('function function', 'function') %>
  axios.interceptors.request.use(
    (config) => reqInter(config, ctx)
  )
  <% } %>

  // Error handler
  axios.interceptors.response.use(undefined, errorHandler.bind(ctx));

  // Make accessible using context
  app.axios = app.$axios = axios
  ctx.axios = ctx.$axios = axios
  if (store) {
    store.axios = store.$axios = axios
  }

  // Setup axios helpers
  setupHelpers(axios)

}
