/**
 * The media engine deliberately lives in the system WebView. Chromium already
 * contains the WebRTC codecs, echo cancellation and bandwidth control; the APK
 * only pays for the WebView bridge and keeps the existing React Native call UI.
 */
export const CALL_ENGINE_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#10171e}
video{position:absolute;width:100%;height:100%;object-fit:cover;background:#10171e}
#local{width:34%;height:25%;right:14px;bottom:14px;border-radius:14px;border:1px solid #ffffff66;z-index:2}
#remote{inset:0}
</style></head><body>
<video id="remote" autoplay playsinline></video><video id="local" autoplay muted playsinline></video>
<script>
(function(){
  var pc=null, stream=null, videoEnabled=false, front=true, started=false;
  var remote=document.getElementById('remote'), local=document.getElementById('local');
  function post(value){
    if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(value));
  }
  function signal(kind,payload){post({type:'signal',kind:kind,payload:JSON.stringify(payload)});}
  function state(value){post({type:'state',value:value});}
  function fail(error){post({type:'error',message:String(error&&error.message||error)});}
  function onDescription(description){
    pc.setLocalDescription(description).then(function(){ signal(description.type,description); }).catch(fail);
  }
  async function start(options){
    if(started) return;
    started=true; videoEnabled=!!options.video; front=options.front !== false;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true,video:videoEnabled?{facingMode:front?'user':'environment'}:false});
      local.srcObject=stream;
      pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
      stream.getTracks().forEach(function(track){pc.addTrack(track,stream);});
      pc.ontrack=function(event){if(event.streams&&event.streams[0]) remote.srcObject=event.streams[0];};
      pc.onicecandidate=function(event){if(event.candidate) signal('ice',event.candidate);};
      pc.onconnectionstatechange=function(){
        if(pc.connectionState==='connected') state('connected');
        else if(pc.connectionState==='failed'||pc.connectionState==='disconnected') state('reconnecting');
        else state(pc.connectionState);
      };
      post({type:'ready'});
      if(options.initiator) onDescription(await pc.createOffer());
    }catch(error){fail(error);}
  }
  async function receive(item){
    if(!pc) return;
    try{
      if(item.kind==='offer'){
        await pc.setRemoteDescription(JSON.parse(item.payload));
        onDescription(await pc.createAnswer());
      }else if(item.kind==='answer'){
        await pc.setRemoteDescription(JSON.parse(item.payload));
      }else if(item.kind==='ice'){
        await pc.addIceCandidate(JSON.parse(item.payload));
      }else if(item.kind==='end'){
        state('ended');
      }
    }catch(error){fail(error);}
  }
  async function command(value){
    if(value.name==='mute'&&stream){stream.getAudioTracks().forEach(function(track){track.enabled=!value.value;});}
    if(value.name==='video'&&stream){
      videoEnabled=!!value.value;
      stream.getVideoTracks().forEach(function(track){track.enabled=videoEnabled;});
    }
    if(value.name==='flip'&&stream&&videoEnabled){
      try{
        var next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:front?'environment':'user'}});
        var track=next.getVideoTracks()[0], sender=pc.getSenders().find(function(item){return item.track&&item.track.kind==='video';});
        if(sender) await sender.replaceTrack(track);
        stream.getVideoTracks().forEach(function(item){item.stop();});
        stream.addTrack(track); local.srcObject=stream; front=!front;
      }catch(error){fail(error);}
    }
  }
  window.__messengerStart=start; window.__messengerSignal=receive; window.__messengerCommand=command;
  post({type:'loaded'});
})();
</script></body></html>`;
