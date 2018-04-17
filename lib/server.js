const Slackbot = require('slackbots')
const messages = require('./messages')
const {
  isDirectMessage,
  isBotMessage,
  isMessage,
  isBotCommand
} = require('./helpers')


process.env.SLACK_TOKEN = 'xoxb-304619527120-OdNqHljRD6k6YEdLgGwMhiZn';
process.env.GH_TOKEN = 'c77c3038937441d7e6469872902599589aebffae';
process.env.GH_REPOS = 'spacebetween/hrgo-recruitment,spacebetween/hrgo-registrator,spacebetween/remote-trauma,spacebetween/spacebetween-v2,spacebetween/SGBD,spacebetween/HRGOBranchApp,spacebetween/manual';

const express = require('express'),
  app = express();

const { createApolloFetch } = require('apollo-fetch');

const fetcher = createApolloFetch(
  { uri: 'https://api.github.com/graphql' }
);
fetcher.use(
  ({ request, options }, next) => {
    if (!options.headers) {
      options.headers = {};
    }
    options.headers['Authorization'] = `Bearer ${}`;

    next();
  });
const schema = makeRemoteExecutableSchema({
  schema: await introspectSchema(fetcher),
  fetcher,
});

app.use(
  '/graphql',
  bodyParser.json(),
  graphqlExpress(req => {
    return {
      schema: schema,
    };
  }),
);

module.exports = function server() {
  const env = process.env
  const requiredEnvs = ['SLACK_TOKEN', 'GH_TOKEN', 'GH_REPOS']
  if (!requiredEnvs.every((k) => !!env[k])) {
    throw (
      new Error('Missing one of this required ENV vars: ' + requiredEnvs.join(','))
    )
  }

  const channels = env.SLACK_CHANNELS ? env.SLACK_CHANNELS.split(',') : []
  const groups = env.SLACK_GROUPS ? env.SLACK_GROUPS.split(',') : []
  const repos = env.GH_REPOS ? env.GH_REPOS.split(',') : []
  const labels = env.GH_LABELS
  const checkInterval = env.CHECK_INTERVAL || 100 // 1 hour default
  const botParams = { icon_url: env.SLACK_BOT_ICON }

  const bot = new Slackbot({
    token: env.SLACK_TOKEN,
    name: env.SLACK_BOT_NAME || 'Pr. Police'
  })

  bot.on('start', () => {
    getPullRequests('spacebetween', repos)
      .then(buildMessage)
      .then(notifyAllChannels)
  })

  bot.on('message', (data) => {
    if ((isMessage(data) && isBotCommand(data)) ||
      (isDirectMessage(data) && !isBotMessage(data))) {
      getPullRequests()
        .then(buildMessage)
        .then((message) => {
          bot.postMessage(data.channel, message, botParams)
        })
    }
  })

  bot.on('error', (err) => {
    console.error(err)
  })

  let gh = false;
  function github() {
    gh = new Github({ token: process.env.GH_TOKEN })
  }

  function getPullRequests(user, repos, labels) {
    if (!gh) { github() }


    repos.forEach((element) => {
      gh.getRepo(element).listPullRequests({ state: open }).then((requests) => {
        console.log(requests.data)
      })
    })
  }


  function buildMessage(data) {
    if (!data) {
      return Promise.resolve(messages.GITHUB_ERROR)
    }

    if (data.length < 1) {
      return Promise.resolve(messages.NO_PULL_REQUESTS)
    }

    const headers = [messages.PR_LIST_HEADER, '\n']

    const message = data.map((item) => {
      return `:star: ${item.title} | ${item.html_url}`
    })

    return Promise.resolve(headers.concat(message).join('\n'))
  }

  function notifyAllChannels(message) {
    channels.map((channel) => {
      bot.postMessageToChannel(channel, message, botParams)
    })

    groups.map((group) => {
      bot.postMessageToGroup(group, message, botParams)
    })
  }
}
