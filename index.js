const { Client, Util } = require('discord.js');

const client = new Client({ disableEveryone: true });
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config.json');
const { readdirSync } = require('fs')
const Enmap = require('enmap')
const ownerID = '291676547549626379'
const active = new Map()
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();



client.on("ready", () => {
  console.log(`Olá, ${client.user.username} está online. :)`);

  client.user.setPresence({
      status: "online",
      game: {
          name: "Em desenvolvimento...",
          type: "STREAMING"
      }
  }); 
});

client.on('message', async message => { // eslint-disable-line

    if(message.author.bot) return;
    if(message.channel.type === "dm") return;
    if(!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();
  const searchString = args.slice(1).join(' ');
  const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
  const serverQueue = queue.get(message.guild.id);
      
  if (command.length === 0) return;

  const cmd = client.commands.get(command)
  if (!cmd) return

  console.log('log', `${message.author.username} (${message.author.id}) executou o comando: ${cmd.help.name}`)
  if (cmd.conf.onlyguilds && !message.guild) return // Guild check
  cmd.run(client, message, args)

  if (command === 'play') {
	const voiceChannel = message.member.voiceChannel;
	if (!voiceChannel) return message.channel.send('Me desculpe, mas você precisa estar em um canal de voz para que eu possa tocar música!');
	const permissions = voiceChannel.permissionsFor(message.client.user);
	if (!permissions.has('CONNECT')) {
		return message.channel.send('Não consigo me conectar ao seu canal de voz, verifique se tenho as devidas permissões.');
	}
	if (!permissions.has('SPEAK')) {
		return message.channel.send('Eu não posso falar neste canal de voz, verifique se tenho as devidas permissões.');
	}

	if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
		const playlist = await youtube.getPlaylist(url);
		const videos = await playlist.getVideos();
		for (const video of Object.values(videos)) {
			const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
			await handleVideo(video2, message, voiceChannel, true); // eslint-disable-line no-await-in-loop
		}
		return message.channel.send(`Adc Playlist: **${playlist.title}** foi bem adicionada a lista!`);
	} else {
		try {
			var video = await youtube.getVideo(url);
		} catch (error) {
			try {
				var videos = await youtube.searchVideos(searchString, 10);
				let index = 0;
				message.channel.send(`
__**Seleção**__

${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}

Escolha uma das músicas de 1-10
				`);
				// eslint-disable-next-line max-depth
				try {
					var response = await message.channel.awaitMessages(message2 => message2.content > 0 && message2.content < 11, {
						maxMatches: 1,
						time: 25000,
						errors: ['time']
					});
				} catch (err) {
					console.error(err);
					return message.channel.send('Nenhum valor inserido ou está inválido , cancelando a operação de seleção de vídeo.');
				}
				const videoIndex = parseInt(response.first().content);
				var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
			} catch (err) {
				console.error(err);
				return message.channel.send('🆘 Não consegui obter nenhum resultado de pesquisa.');
			}
		}
		return handleVideo(video, message, voiceChannel);
	}
} else if (command === 'skip') {
	if (!message.member.voiceChannel) return message.channel.send('Você não está em um canal de voz');
	if (!serverQueue) return message.channel.send('Não há nada tocando');
	serverQueue.connection.dispatcher.end('Música pulada com sucesso!');
	return undefined;
} else if (command === 'leave') {
	if (!message.member.voiceChannel) return message.channel.send('Você não está em um canal de voz!');
	if (!serverQueue) return message.channel.send('Não há nada tocando');
	serverQueue.songs = [];
	serverQueue.connection.dispatcher.end('O Comando de parar foi usado!');
	return undefined;
} else if (command === 'volume') {
	if (!message.member.voiceChannel) return message.channel.send('Você não está em um canal de voz!');
	if (!serverQueue) return message.channel.send('Não há nada tocando');
	if (!args[1]) return message.channel.send(`O Volume atual é: **${serverQueue.volume}**`);
	serverQueue.volume = args[1];
	serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
	return message.channel.send(`Ajustar o volume para: **${args[1]}**`);
} else if (command === 'np') {
	if (!serverQueue) return message.channel.send('Não há nada tocando');
	return message.channel.send(`Tocando: **${serverQueue.songs[0].title}**`);
} else if (command === 'queue') {
	if (!serverQueue) return message.channel.send('Não há nada tocando.');
	return message.channel.send(`
__**Lista de Música:**__

${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}

**Tocando Agora:** ${serverQueue.songs[0].title}
	`);
} else if (command === 'pause') {
	if (serverQueue && serverQueue.playing) {
		serverQueue.playing = false;
		serverQueue.connection.dispatcher.pause();
		return message.channel.send('⏸ Pausado.');
	}
	return message.channel.send('Não há nada tocando.');
} else if (command === 'resume') {
	if (serverQueue && !serverQueue.playing) {
		serverQueue.playing = true;
		serverQueue.connection.dispatcher.resume();
		return message.channel.send('▶ Retomado.');
	}
	return message.channel.send('Não há nada tocando.');
}

return undefined;
});

async function handleVideo(video, message, voiceChannel, playlist = false) {
const serverQueue = queue.get(message.guild.id);
console.log(video);
const song = {
	id: video.id,
	title: Util.escapeMarkdown(video.title),
	url: `https://www.youtube.com/watch?v=${video.id}`
};
if (!serverQueue) {
	const queueConstruct = {
		textChannel: message.channel,
		voiceChannel: voiceChannel,
		connection: null,
		songs: [],
		volume: 5,
		playing: true
	};
	queue.set(message.guild.id, queueConstruct);

	queueConstruct.songs.push(song);

	try {
		var connection = await voiceChannel.join();
		queueConstruct.connection = connection;
		play(message.guild, queueConstruct.songs[0]);
	} catch (error) {
		console.error(`Não foi possivel entrar no canal de voz: ${error}`);
		queue.delete(message.guild.id);
		return message.channel.send(`Não foi possivel entrar no canal de voz: ${error}`);
	}
} else {
	serverQueue.songs.push(song);
	console.log(serverQueue.songs);
	if (playlist) return undefined;
	else return message.channel.send(`**${song.title}** foi adicionado a lista!`);
}
return undefined;
}

function play(guild, song) {
const serverQueue = queue.get(guild.id);

if (!song) {
	serverQueue.voiceChannel.leave();
	queue.delete(guild.id);
	return;
}
console.log(serverQueue.songs);


const stream = ytdl(song.url, {filter : 'audioonly'});
const dispatcher = serverQueue.connection.playStream(stream, song.url);
dispatcher.on('end', reason => {
	serverQueue.songs.shift();
	play(guild, serverQueue.songs[0]);
})
.on('error', error => console.error(error));
dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

serverQueue.textChannel.send(`Tocando: **${song.title}**`);
}

client.commands = new Enmap()
client.startTime = Date.now()
const cmdFiles = readdirSync('./commands/')
console.log('log', `Carregando o total de ${cmdFiles.length} comandos.`)
cmdFiles.forEach(f => {
  try {

    const props = require(`./commands/${f}`)
    if (f.split('.').slice(-1)[0] !== 'js') return

    console.log('log', `Carregando comando: ${props.help.name}`)

    if (props.init) props.init(client)


	client.commands.set(props.help.name, props)
    if (props.help.aliases) {
      props.alias = true
      props.help.aliases.forEach(alias =>  client.commands.set(alias, props))
    }
  } catch (e) {
    console.log(`Impossivel executar comando ${f}: ${e}`)
  }
})


client.login(TOKEN);
