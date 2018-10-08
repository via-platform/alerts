const {CompositeDisposable, Disposable, Emitter} = require('via');
const _ = require('underscore-plus');
const UUID = require('uuid/v1');
const axios = require('axios');
const debounce = 300;

const ALERT_LIFECYCLE = ['loading', 'pending', 'transmitting', 'open', 'updating', 'canceling', 'canceled', 'expired'];
const VALID_ALERT_TYPES = ['last-price', '86400-volume'];
const VALID_PROPERTIES = ['value', 'created', 'updated', 'status', 'type', 'uuid', 'market'];
const VALID_DIRECTIONS = ['above', 'below', 'cross'];
const VALID_EXPIRATIONS = ['gtc', '1-minute', '5-minutes', '15-minutes', '1-hour', '6-hours', '24-hours', '7-days', '30-days'];

const DIRECTIONS = {
    above: 'rose above',
    below: 'fell below',
    cross: 'crossed'
};

const url = 'https://data.via.world/api/v1/alerts';

module.exports = class Alert {
    constructor(manager, params = {}){
        this.manager = manager;
        this.emitter = new Emitter();
        this.save = _.debounce(this.save.bind(this), debounce);

        this.initialize(params);
    }

    initialize(params){
        if(params.market) this.market = params.market;

        this._last = params.last;
        this._value = params.value || 0;
        this._created = params.created ? new Date(params.created) : null;
        this._updated = params.updated ? new Date(params.updated) : null;
        this._expiration = params.expiration ? new Date(params.expiration) : null;
        this._type = params.type || 'last-price';
        this._uuid = params.uuid || UUID();

        this.status = params.status || 'pending';
        this.direction = params.direction || 'above';
        this.cooldown = params.cooldown || via.config.get('alerts.defaultCooldown');
        this.kill = params.kill || via.config.get('alerts.defaultCancelAfterTrigger');
        this.email = params.email || via.config.get('alerts.defaultSendEmail');
        this.sms = params.sms || via.config.get('alerts.defaultSendSMS');
        this.expires = params.expires || via.config.get('alerts.defaultExpiration');
    }

    didUpdate(name, value){
        if(name) this.emitter.emit(`did-update-${name}`, value);
        this.emitter.emit('did-update');
        this.manager.didUpdateAlert(this, name, value);
    }

    get market(){
        return this._market;
    }

    get last(){
        return this._last;
    }

    get kill(){
        return this._kill;
    }

    get email(){
        return this._email;
    }

    get sms(){
        return this._sms;
    }

    get direction(){
        return this._direction;
    }

    get created(){
        return this._created;
    }

    get updated(){
        return this._updated;
    }

    get expiration(){
        return this._expiration;
    }

    get status(){
        return this._status;
    }

    get type(){
        return this._type;
    }

    get value(){
        return this._value;
    }

    get uuid(){
        return this._uuid;
    }

    get cooldown(){
        return this._cooldown;
    }

    get expires(){
        return this._expires;
    }

    set uuid(uuid){
        return this._uuid = uuid;
    }

    set market(market){
        if(this._market === market) return;

        this._market = market;

        this.didUpdate('market', market);
    }

    set type(type){
        if(this._type !== type && VALID_ALERT_TYPES.includes(type)){
            this._type = type;
            this.didUpdate('type', type);

            //Remove extraneous properties to not confuse the user / developer
            //These extra properties wouldn't be sent anyway, but it helps will clarity
            if(this.type === 'market'){
                this.limit = undefined;
                this.stop = undefined;
            }else if(this.type === 'limit'){
                this.stop = undefined;
            }
        }
    }

    set value(value){
        if(this._value === value) return;
        if(_.isNumber(value) && value < 0) return console.warn('Cannot set value to less than zero.');

        const property = this.type.indexOf('-volume') === -1 ? 'price' : 'amount';
        this._value = (this.market && _.isNumber(value)) ? via.functions.number.truncate(value, this.market.precision[property]) : value;
        this.didUpdate('value', value);
    }

    set cooldown(value){
        if(this._cooldown === value) return;
        if(_.isNumber(value) && value < 0) return console.warn('Cannot set cooldown to less than zero.');
        this._cooldown = _.isNumber(value) ? value : 0;
        this.didUpdate('cooldown', value);
    }

    set status(status){
        //Return if we're already past here in the alert lifecycle
        if(ALERT_LIFECYCLE.indexOf(this.status) >= ALERT_LIFECYCLE.indexOf(status)) return;
        const previous = status;
        this._status = status;
        this.didUpdate('status', status);
    }

    set direction(direction){
        if(this._direction === direction || !VALID_DIRECTIONS.includes(direction)) return;
        this._direction = direction;
        this.didUpdate('direction', direction);
    }

    set created(date){
        if(this._created === date || !_.isDate(date)) return;
        this._created = date;
        this.didUpdate('created', date);
    }

    set updated(date){
        if(this._updated === date || !_.isDate(date)) return;
        this._updated = date;
        this.didUpdate('updated', date);
    }

    set expiration(date){
        if(this._expiration === date || !_.isDate(date)) return;
        this._expiration = date;
        this.didUpdate('expiration', date);
    }

    set kill(kill){
        if(this._kill === kill) return;
        this._kill = !!kill;
        this.didUpdate('kill', kill);
    }

    set email(email){
        if(this._email === email) return;
        this._email = !!email;
        this.didUpdate('email', email);
    }

    set sms(sms){
        if(this._sms === sms) return;
        this._sms = !!sms;
        this.didUpdate('sms', sms);
    }

    set expires(expires){
        if(this._expires === expires || VALID_EXPIRATIONS.indexOf(expires) === -1) return;
        this._expires = expires;
        this.didUpdate('expires', expires);
    }

    isValidValue(){
        //If this.value...
        return (
            !_.isUndefined(this.value) && //Is not undefined
            _.isNumber(this.value) && //Is a number
            !_.isNaN(this.value) && //Is not NaN
            this.value > 0 //Is greater than 0
        );
    }

    exchangeSupportsAlertType(){
        if(!this.market) return false;

        switch(this.type){
            case 'value-above':     return true;
            case 'value-below':     return true;
            case 'value-crosses':   return true;
            default:                return true;
        }
    }

    isPending(){
        return ['pending', 'transmitting'].includes(this.status);
    }

    isOpen(){
        return ['open', 'updating', 'canceling'].includes(this.status);
    }

    isDone(){
        return ['canceled', 'expired'].includes(this.status);
    }

    isValidAlert(){
        if(!this.market) return false;
        if(!ALERT_LIFECYCLE.includes(this.status)) return false;
        if(!VALID_ALERT_TYPES.includes(this.type)) return false;
        if(!VALID_DIRECTIONS.includes(this.direction)) return false;

        return this.exchangeSupportsAlertType() && this.isValidValue();
    }

    transmit(){
        if(this.status !== 'pending'){
            throw new Error('This alert cannot be transmitted again.');
        }

        if(!this.market){
            throw new Error('Alerts must contain a valid market.');
        }

        if(!this.isValidAlert()){
            throw new Error('This is not a valid alert.');
        }

        this.emitter.emit('will-transmit');
        this.status = 'transmitting';

        return axios.post(url, {
                value: this.value,
                type: this.type,
                uuid: this.uuid,
                market: this.market.id,
                exchange: this.market.exchange.id,
                direction: this.direction,
                sms: this.sms,
                email: this.email,
                kill: this.kill,
                expires: this.expires,
                cooldown: this.cooldown
            },
            via.user.headers()
        )
        .then(res => {
            this.created = res.data.created;
            this.status = 'open';
            this.emitter.emit('did-transmit');
        })
        .catch(({response}) => {
            this._status = 'pending';
            this.didUpdate('status', 'pending');
            this.emitter.emit('did-transmit-error');
            via.console.error(response.data.error, response.data.detail);
        });
    }

    cancel(confirm = via.config.get('core.confirmCancelAlert')){
        if(confirm){
            const confirmed = via.confirm({
                message: 'Remove Alert',
                detail: 'Are you sure you want to cancel this alert?',
                buttons: ['Do Nothing', 'Cancel Alert'],
                defaultId: 1,
                cancelId: 0
            });

            if(!confirmed) return;
        }

        this.emitter.emit('will-cancel');
        this.status = 'canceling';

        return axios.delete(`${url}/${this.uuid}`, via.user.headers())
        .then(() => {
            this.status = 'canceled';
            this.emitter.emit('did-cancel');
        })
        .catch(({response}) => {
            this._status = 'open';
            this.didUpdate('status', 'open');
            via.console.error(response.data.error, response.data.detail);
        });
    }

    save(){
        if(this.status !== 'open') return Promise.resolve();

        return axios.put(`${url}/${this.uuid}`,
            {value: this.value, type: this.type, market: this.market.id, exchange: this.market.exchange.id, direction: this.direction},
            via.user.headers()
        )
        .catch(({response}) => {
            via.console.error(response.data.error, response.data.detail);
        });
    }

    update(properties){
        for(const [property, value] of Object.entries(properties)){
            if(VALID_PROPERTIES.includes(property)) this[property] = value;
        }
    }

    fill(params){
        //Handle a fill event
        const fill = new Fill(this, params);
        this.fills.push(fill);
        this.didUpdate('fills', fill);
    }

    filled(){
        //Set the status to filled and fetch any fills associated with this alert
        this.status = 'filled';
    }

    change(event){
        //Handle a change event, where the alert has been modified by the server
    }

    activate(){
        //A stop alert has been activated
        if(this.type.indexOf('stop-')) return;
        this.type = this.type.replace('stop-', '');
        this.status = 'open';
    }

    notify(){
        if(this.status === 'canceled' && via.config.get('core.notifyCanceledAlert')){
            via.notifications.notify('Alert Canceled', {body: `Alert was successfully canceled.`});
        }

        if(this.status === 'expired' && via.config.get('core.notifyExpiredAlert')){
            const currency = (this.type.indexOf('limit') !== -1) ? this.market.base : this.market.quote;
            const body = `Your ${this.type.toUpperCase()} alert to ${this.side.toUpperCase()} ${this.amount} ${currency} has expired.`;
            via.notifications.notify('Alert Expired', {body});
        }

        if(this.status === 'open' && via.config.get('core.notifyPlacedAlert')){
            const currency = (this.type.indexOf('limit') !== -1) ? this.market.base : this.market.quote;
            const body = `Transmitted ${this.type.toUpperCase()} alert to ${this.side.toUpperCase()} ${this.amount} ${currency}.`;
            via.notifications.notify('Alert Placed', {body});
        }
    }

    trigger(event){
        //TODO this message will be messed up for 24h volume alerts
        const type = this.type === 'last-price' ? 'last price' : '24h volume';
        const body = `The ${type} of ${this.market.title} ${DIRECTIONS[this.direction]} ${this.value.toFixed(this.market.precision.price)} ${this.market.quote}.`;

        via.notifications.notify('Alert Triggered', {body});
        via.console.alert(body);
    }

    destroy(){
        this.emitter.emit('did-destroy');
        this.emitter.dispose();
        this.manager.didDestroyAlert(this);
    }

    onWillCancel(callback){
        return this.emitter.on('will-cancel', callback);
    }

    onDidCancel(callback){
        return this.emitter.on('did-cancel', callback);
    }

    onDidUpdateStatus(callback){
        return this.emitter.on('did-update-status', callback);
    }

    onDidUpdate(callback){
        return this.emitter.on('did-update', callback);
    }

    onDidUpdateType(callback){
        return this.emitter.on('did-update-type', callback);
    }

    onDidUpdateValue(callback){
        return this.emitter.on('did-update-value', callback);
    }

    onDidUpdateMarket(callback){
        return this.emitter.on('did-update-market', callback);
    }

    onWillTransmit(callback){
        return this.emitter.on('will-transmit', callback);
    }

    onDidTransmit(callback){
        return this.emitter.on('did-transmit', callback);
    }

    onDidTransmitError(callback){
        return this.emitter.on('did-transmit-error', callback);
    }

    onDidDestroy(callback){
        return this.emitter.on('did-destroy', callback);
    }
}
